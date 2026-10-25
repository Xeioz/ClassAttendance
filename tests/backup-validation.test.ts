import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { decrypt, encrypt } from '../src/db/crypto';
import { exportBackup, restoreBackup } from '../src/db/backup';
import {
  BACKUP_MAX_BYTES,
  BACKUP_ROSTER_LIMIT,
  BACKUP_TABLE_LIMIT,
  validateBackupData,
  validateBackupSize,
  type BackupData,
} from '../src/db/backupValidation';
import { unlockVault } from '../src/db/vault';
import {
  closeSession,
  createSession,
  listStudents,
  recordAttendance,
  saveRoster,
} from '../src/domain/attendance';
import { flagDispute, readAudit, resolveDispute } from '../src/domain/audit';
import { readReportSnapshot } from '../src/domain/reports';
import { AuditTrail } from '../src/components/teacher/AuditTrail';
import { attendanceCSV } from '../src/utils/csvExport';
import { exportExcel } from '../src/utils/excel';
import { downloadFile } from '../src/utils/download';
import type { Cipher, Session, VaultKeys, VaultMeta } from '../src/types';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
const pin = '104928573612';
const now = Date.UTC(2026, 9, 22, 10);
let keys: VaultKeys;
let session: Session;
let valid: BackupData;
let meta: VaultMeta;

async function snapshot() {
  return db.transaction('r', db.tables, async () => ({
    meta: await db.meta.toArray(),
    students: await db.students.toArray(),
    sessions: await db.sessions.toArray(),
    attendance: await db.attendance.toArray(),
    scanEvents: await db.scanEvents.toArray(),
  }));
}
async function fileFor(data: unknown, backupMeta: VaultMeta = meta) {
  return new File(
    [
      JSON.stringify({
        format: 'attendance-desk',
        v: 1,
        meta: backupMeta,
        payload: await encrypt(keys.encryption, data, 'backup:v1'),
      }),
    ],
    'synthetic.enc.json',
  );
}
async function event(payload: unknown, id = 'synthetic-event') {
  return {
    id,
    sessionId: session.id,
    encrypted: await encrypt(keys.encryption, payload, `event:${id}`),
  };
}
async function payloadOf(cipher: Cipher, context: string) {
  return decrypt<Record<string, unknown>>(keys.encryption, cipher, context);
}
async function assertPreserved(file: File, pattern?: string | RegExp, usePin = pin) {
  const before = await snapshot();
  const rejection = restoreBackup(file, usePin);
  if (pattern) await expect(rejection).rejects.toThrow(pattern);
  else await expect(rejection).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
  const reopened = await unlockVault(pin);
  expect((await listStudents(reopened)).map((student) => student.name)).toContain(
    'Current student must survive',
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault(pin);
  meta = (await db.meta.get('vault'))!;
  await saveRoster(keys, [{ id: '00-1', name: 'Synthetic José', section: 'A' }]);
  session = await createSession(keys, {
    course: 'QA101',
    section: 'A',
    roomPin: '492',
    startsAt: now,
    graceMinutes: 15,
    timezone: 'UTC',
  });
  await recordAttendance(
    keys,
    session.id,
    { student: session.roster[0], reason: 'Synthetic verified ID' },
    now,
  );
  const saved = await snapshot();
  valid = {
    students: saved.students,
    sessions: saved.sessions,
    attendance: saved.attendance,
    scanEvents: saved.scanEvents,
  };
  // Make the live workspace visibly different from the restore fixture.
  await closeSession(keys, session);
  await saveRoster(keys, [{ id: '002', name: 'Current student must survive', section: 'A' }]);
});
afterEach(() => vi.restoreAllMocks());

describe('backup schema validation before replacement', () => {
  it('rejects an authenticated object-valued reason before replacing any table and keeps the workspace unlockable', async () => {
    const data = structuredClone(valid);
    const original = await payloadOf(
      data.scanEvents[0].encrypted,
      `event:${data.scanEvents[0].id}`,
    );
    data.scanEvents[0].encrypted = await encrypt(
      keys.encryption,
      { ...original, reason: { private: 'must not reach error text' } },
      `event:${data.scanEvents[0].id}`,
    );
    await assertPreserved(await fileFor(data), /scanEvents\[0\]\.reason/);
    await expect(restoreBackup(await fileFor(data), pin)).rejects.not.toThrow(
      'must not reach error text',
    );
  });

  it.each([
    ['action', 'UNKNOWN_ACTION'],
    ['at', 'yesterday'],
    ['at', 8.64e15 + 1],
    ['performedBy', 'REMOTE_ADMIN'],
    ['newStatus', 'NOT_A_STATUS'],
    ['previousStatus', {}],
    ['firstAt', []],
    ['secondAt', 'not a timestamp'],
    ['studentId', {}],
    ['studentToken', 'unknown-student'],
    ['disputeId', {}],
    ['before', { bad: 'alias' }],
  ])('rejects malformed audit %s without modifying the current database', async (field, value) => {
    const data = structuredClone(valid),
      row = data.scanEvents[0];
    const payload = await payloadOf(row.encrypted, `event:${row.id}`);
    row.encrypted = await encrypt(
      keys.encryption,
      { ...payload, [field]: value },
      `event:${row.id}`,
    );
    await assertPreserved(await fileFor(data), /scanEvents\[0\]/);
  });

  it.each([
    ['student', 'name', {}],
    ['student', 'displayId', 'different-id'],
    ['student', 'token', { invalid: 'override' }],
    ['session', 'institution', {}],
    ['session', 'roomPin', '12'],
    ['session', 'timezone', []],
    ['session', 'startsAt', 8.64e15 + 1],
    ['session', 'closedAt', 'now'],
    ['attendance', 'reason', {}],
    ['attendance', 'originalAt', {}],
    ['attendance', 'source', 'UNKNOWN'],
  ])('validates consumed %s.%s fields', async (table, field, value) => {
    const data = structuredClone(valid);
    const row =
      table === 'student'
        ? data.students[0]
        : table === 'session'
          ? data.sessions[0]
          : data.attendance[0];
    const context =
      table === 'student'
        ? `student:${data.students[0].token}`
        : table === 'session'
          ? `session:${session.id}`
          : `attendance:${session.id}:${session.roster[0].token}`;
    row.encrypted = await encrypt(
      keys.encryption,
      { ...(await payloadOf(row.encrypted, context)), [field]: value },
      context,
    );
    await assertPreserved(await fileFor(data), /Invalid backup/);
  });

  it('rejects duplicate primary keys, wrong roster relationships and conflicting active sessions', async () => {
    for (const name of ['students', 'sessions', 'attendance', 'scanEvents'] as const) {
      const data = structuredClone(valid);
      // Construct a duplicate using a union-free table assignment.
      const malformed = { ...data, [name]: [...data[name], data[name][0]] };
      await assertPreserved(await fileFor(malformed), /duplicate/);
    }
    const unknownAttendance = structuredClone(valid);
    unknownAttendance.attendance[0].studentToken = 'unknown';
    await assertPreserved(await fileFor(unknownAttendance), /unknown session or roster student/);
    const conflict = structuredClone(valid);
    conflict.sessions.push({
      ...conflict.sessions[0],
      id: 'another-session',
      encrypted: await encrypt(
        keys.encryption,
        await payloadOf(conflict.sessions[0].encrypted, `session:${session.id}`),
        'session:another-session',
      ),
    });
    await assertPreserved(await fileFor(conflict), /conflicting active sessions/);
  });

  it('rejects invalid HMAC identity relationships and malformed payload roots', async () => {
    const data = structuredClone(valid);
    data.students[0].sectionToken = 'wrong-section-token';
    await assertPreserved(await fileFor(data), /sectionToken/);
    for (const value of [null, [], { ...valid, students: {} }])
      await assertPreserved(await fileFor(value), /Invalid backup/);
  });

  it('preserves every table and metadata for wrong PIN, invalid ciphertext, and write failure', async () => {
    await assertPreserved(await fileFor(valid), undefined, '999999');
    const damaged = structuredClone(valid);
    damaged.attendance[0].encrypted.data = 'A'.repeat(24);
    await assertPreserved(await fileFor(damaged), /attendance\[0\]\.encrypted/);
    const writeFailure = vi
      .spyOn(db.scanEvents, 'bulkAdd')
      .mockRejectedValueOnce(new Error('Simulated quota failure'));
    await assertPreserved(await fileFor(valid), /Simulated quota failure/);
    writeFailure.mockRestore();
  });

  it('rejects mismatched dispute references before replacement', async () => {
    const data = structuredClone(valid);
    data.scanEvents.push(
      await event({
        action: 'DISPUTE_RESOLVED',
        at: now,
        performedBy: 'TEACHER_PIN',
        studentToken: session.roster[0].token,
        studentId: '001',
        firstAt: now,
        secondAt: now + 1,
        disputeId: 'missing-flag',
        reason: 'Reviewed synthetic identity',
      }),
    );
    await assertPreserved(await fileFor(data), /disputeId/);
  });

  it('rejects cross-action fields that would misattribute lifecycle history', async () => {
    const data = structuredClone(valid);
    data.scanEvents = [
      await event({
        action: 'SESSION_CLOSED',
        at: now,
        performedBy: 'TEACHER_PIN',
        studentId: '001',
        studentToken: session.roster[0].token,
      }),
    ];
    await assertPreserved(await fileFor(data), /studentToken/);
    data.scanEvents = [
      await event({
        action: 'DUPLICATE_SCAN',
        at: now,
        performedBy: 'TEACHER_PIN',
        studentId: '001',
        studentToken: session.roster[0].token,
        previousStatus: 'PRESENT',
        newStatus: 'ABSENT',
        firstAt: now,
        secondAt: now + 1,
      }),
    ];
    await assertPreserved(await fileFor(data), /newStatus/);
  });
});

describe('current and legacy recovery compatibility', () => {
  it('restores current history including legitimate unlisted scans and completed disputes', async () => {
    await restoreBackup(await fileFor(valid), pin);
    await recordAttendance(
      keys,
      session.id,
      { raw: JSON.stringify({ v: 1, id: 'UNLISTED999', ch: '492', ts: now / 1000 }) },
      now,
    );
    const duplicate = await recordAttendance(
      keys,
      session.id,
      { student: session.roster[0], reason: 'Repeated presentation' },
      now + 1,
    );
    await flagDispute(
      keys,
      session.id,
      session.roster[0].token,
      'Verify synthetic identity',
      duplicate.secondAt,
    );
    const flagged = (await readAudit(keys, session.id)).find(
      (event) => event.action === 'DISPUTE_FLAGGED',
    )!;
    await resolveDispute(keys, session.id, flagged.eventId, 'Synthetic identity verified');
    await exportBackup(keys);
    const blob = vi.mocked(downloadFile).mock.calls.at(-1)![0];
    await restoreBackup(new File([blob], 'roundtrip.json'), pin);
    const report = await readReportSnapshot(await unlockVault(pin), session.id);
    expect(
      report.audit.some(
        (event) => event.action === 'UNLISTED_SCAN' && event.studentId === 'UNLISTED999',
      ),
    ).toBe(true);
    expect(report.audit.some((event) => event.action === 'DISPUTE_RESOLVED')).toBe(true);
    expect(
      renderToString(createElement(AuditTrail, { events: report.audit, session: report.session })),
    ).toContain('DISPUTE_RESOLVED');
    expect(attendanceCSV(report.session, report.attendance)).toContain('00-1');
    await exportExcel(report.session, report.attendance, report.audit);
    expect(vi.mocked(downloadFile).mock.calls.at(-1)![0].type).toContain('spreadsheetml');
  });

  it('restores all original v1 event structures, epoch-zero timestamps, optional legacy metadata and historical rosters', async () => {
    const legacy = structuredClone(valid);
    // Historical rows need not remain in the present-day master roster.
    legacy.students = [];
    const oldSession = await payloadOf(legacy.sessions[0].encrypted, `session:${session.id}`);
    delete oldSession.timezone;
    oldSession.startsAt = 0;
    oldSession.roster = session.roster.map(({ displayId: _display, ...student }) => student);
    legacy.sessions[0].state = 'CLOSED';
    legacy.sessions[0].encrypted = await encrypt(
      keys.encryption,
      oldSession,
      `session:${session.id}`,
    );
    const before = await encrypt(
      keys.encryption,
      { status: 'PRESENT', at: 0, source: 'QR' },
      `attendance:${session.id}:${session.roster[0].token}`,
    );
    legacy.scanEvents = await Promise.all([
      event({ id: '001', source: 'QR', outcome: 'ATTEMPT', at: 0 }, 'legacy-attempt'),
      event({ id: 'UNLISTED999', source: 'QR', outcome: 'UNLISTED', at: 1 }, 'legacy-unlisted'),
      event({ id: '001', source: 'MANUAL', outcome: 'ATTEMPT', at: 2 }, 'legacy-manual'),
      event(
        {
          studentToken: session.roster[0].token,
          before,
          status: 'LATE',
          reason: 'Legacy correction',
          at: 3,
          source: 'CORRECTION',
        },
        'legacy-correction',
      ),
      event(
        {
          studentToken: session.roster[0].token,
          before: null,
          status: 'EXCUSED',
          reason: 'Legacy initial correction',
          at: 4,
          source: 'CORRECTION',
        },
        'legacy-null-before',
      ),
      event({ source: 'SESSION_CLOSED', at: 5 }, 'legacy-close'),
    ]);
    await restoreBackup(await fileFor(legacy), pin);
    const report = await readReportSnapshot(await unlockVault(pin), session.id);
    expect(report.audit).toHaveLength(6);
    expect(report.audit[0]).toMatchObject({
      action: 'LEGACY_SCAN_ATTEMPT',
      at: 0,
      studentId: '001',
    });
    expect(report.audit.find((event) => event.eventId === 'legacy-correction')).toMatchObject({
      previousStatus: 'PRESENT',
      newStatus: 'LATE',
    });
    expect(report.audit.find((event) => event.eventId === 'legacy-unlisted')).toMatchObject({
      action: 'UNLISTED_SCAN',
      studentId: 'UNLISTED999',
    });
    expect(
      renderToString(createElement(AuditTrail, { events: report.audit, session: report.session })),
    ).toContain('Legacy correction');
    expect(attendanceCSV(report.session, report.attendance)).toContain('1970-01-01');
    await exportExcel(report.session, report.attendance, report.audit);
    expect(vi.mocked(downloadFile).mock.calls.at(-1)![0].type).toContain('spreadsheetml');
    await exportBackup(keys);
    await restoreBackup(
      new File([vi.mocked(downloadFile).mock.calls.at(-1)![0]], 'legacy-roundtrip.json'),
      pin,
    );
    expect(await readAudit(keys, session.id)).toHaveLength(6);
  });

  it('rejects malformed legacy nested prior attendance without deleting current records', async () => {
    const data = structuredClone(valid);
    const before = await encrypt(
      keys.encryption,
      { status: 'PRESENT', at: 0, source: 'QR', reason: { invalid: true } },
      `attendance:${session.id}:${session.roster[0].token}`,
    );
    data.scanEvents = [
      await event({
        source: 'CORRECTION',
        studentToken: session.roster[0].token,
        status: 'LATE',
        at: 1,
        reason: 'Synthetic change',
        before,
      }),
    ];
    await assertPreserved(await fileFor(data), /before.reason/);
  });

  it('rejects legacy aliases that would override the validated event identity or status', async () => {
    const data = structuredClone(valid);
    data.scanEvents = [
      await event({ source: 'QR', outcome: 'ATTEMPT', id: '001', studentId: '999', at: now }),
    ];
    await assertPreserved(await fileFor(data), /studentId/);
    data.scanEvents = [
      await event({
        source: 'CORRECTION',
        studentToken: session.roster[0].token,
        status: 'LATE',
        newStatus: 'EXCUSED',
        at: now,
        reason: 'Synthetic change',
        before: null,
      }),
    ];
    await assertPreserved(await fileFor(data), /newStatus/);
  });
});

describe('shared backup export and restore limits', () => {
  it('accepts the documented byte boundary and rejects larger files before reading', async () => {
    expect(() => validateBackupSize(BACKUP_MAX_BYTES)).not.toThrow();
    expect(() => validateBackupSize(BACKUP_MAX_BYTES + 1)).toThrow('25 MB');
    const oversized = new File([], 'oversized.json');
    Object.defineProperty(oversized, 'size', { value: BACKUP_MAX_BYTES + 1 });
    const read = vi.spyOn(oversized, 'text');
    await assertPreserved(oversized, /25 MB/);
    expect(read).not.toHaveBeenCalled();
  });

  it('enforces table and session-roster limits before decrypting their rows', async () => {
    for (const name of ['students', 'sessions', 'attendance', 'scanEvents'])
      await expect(
        validateBackupData({ ...valid, [name]: Array(BACKUP_TABLE_LIMIT + 1).fill(null) }, keys),
      ).rejects.toThrow(`${name}: expected an array with at most 100,000`);
    // At the boundary it advances to row validation instead of incorrectly rejecting the count.
    await expect(
      validateBackupData({ ...valid, students: Array(BACKUP_TABLE_LIMIT).fill(null) }, keys),
    ).rejects.toThrow('students[0]');
    const data = structuredClone(valid);
    const payload = await payloadOf(data.sessions[0].encrypted, `session:${session.id}`);
    payload.roster = Array(BACKUP_ROSTER_LIMIT + 1).fill(null);
    data.sessions[0].encrypted = await encrypt(keys.encryption, payload, `session:${session.id}`);
    await assertPreserved(await fileFor(data), /roster: expected 1–10,000/);
  });

  it('does not offer a backup that fails the same restore validation', async () => {
    const row = (await db.scanEvents.toArray())[0];
    const bad = { ...(await payloadOf(row.encrypted, `event:${row.id}`)), reason: {} };
    await db.scanEvents.update(row.id, {
      encrypted: await encrypt(keys.encryption, bad, `event:${row.id}`),
    });
    const before = await snapshot();
    await expect(exportBackup(keys)).rejects.toThrow('reason');
    expect(downloadFile).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
});
