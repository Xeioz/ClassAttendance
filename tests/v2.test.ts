import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceDatabase, db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { decrypt, encrypt } from '../src/db/crypto';
import { exportBackup, restoreBackup } from '../src/db/backup';
import {
  createClass,
  classStudents,
  listClasses,
  updateClassDefaults,
  associateLegacySession,
  copyLegacyEnrollment,
} from '../src/domain/classes';
import {
  closeSession,
  correctAttendance,
  createSession,
  listSessions,
  saveRoster,
  getAttendance,
  recordAttendance,
} from '../src/domain/attendance';
import { isTeacherBusy, teacherOperation } from '../src/domain/operations';
import { downloadFile } from '../src/utils/download';
import type { ClassPrivate, VaultKeys } from '../src/types';
vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
let keys: VaultKeys;
const pin = '104928573612';
const base: ClassPrivate = {
  course: 'IT301',
  section: 'A',
  term: '2026–27 / 1',
  subject: 'Web',
  room: '',
  institution: '',
  graceMinutes: 15,
};
const student = { id: 'CA202304427', name: 'Peña, José', section: 'A' };
const settings = {
  course: 'IT301',
  section: 'A',
  roomPin: '123456',
  startsAt: Date.now(),
  graceMinutes: 15,
};
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  vi.clearAllMocks();
  keys = await unlockVault(pin);
});
describe('prototypev2 compatibility', () => {
  it('isolates same-section course and term enrollments, while keeping identities encrypted', async () => {
    const a = await createClass(keys, base);
    const b = await createClass(keys, { ...base, course: 'IT302' });
    const c = await createClass(keys, { ...base, term: '2026–27 / 2' });
    await saveRoster(keys, [student], a.id);
    await saveRoster(keys, [{ id: 'CA202304428', name: 'Ana', section: 'A' }], b.id);
    expect((await classStudents(keys, a.id)).map((row) => row.id)).toEqual(['CA202304427']);
    expect((await classStudents(keys, b.id)).map((row) => row.id)).toEqual(['CA202304428']);
    expect(await classStudents(keys, c.id)).toEqual([]);
    const session = await createSession(keys, { ...settings, classId: a.id });
    expect(session.roster.map((row) => row.id)).toEqual(['CA202304427']);
    expect(
      (
        await recordAttendance(keys, session.id, {
          raw: JSON.stringify({
            v: 1,
            id: 'CA202304428',
            ch: settings.roomPin,
            ts: Math.floor(Date.now() / 1000),
          }),
        })
      ).kind,
    ).toBe('unknown');
    expect(JSON.stringify(await db.classes.toArray())).not.toContain('IT301');
  });
  it('rejects section mismatches, name conflicts and imports during active sessions atomically', async () => {
    const a = await createClass(keys, base);
    await expect(saveRoster(keys, [{ ...student, section: 'B' }], a.id)).rejects.toThrow('section');
    expect(await db.students.count()).toBe(0);
    await saveRoster(keys, [student], a.id);
    await expect(
      saveRoster(keys, [{ ...student, name: 'Different Person' }], a.id),
    ).rejects.toThrow('Name conflict');
    expect((await classStudents(keys, a.id))[0].name).toBe(student.name);
    await createSession(keys, { ...settings, classId: a.id });
    await expect(copyLegacyEnrollment(keys, a.id)).rejects.toThrow('Close');
    await expect(
      createSession(keys, { ...settings, course: 'IT302', classId: a.id }),
    ).rejects.toThrow('match');
  });
  it('associates legacy sessions idempotently without changing roster, attendance, or audit evidence', async () => {
    await saveRoster(keys, [student]);
    const legacy = await createSession(keys, settings);
    const roster = JSON.stringify(legacy.roster);
    const events = await db.scanEvents.toArray();
    const a = await createClass(keys, base);
    await associateLegacySession(keys, legacy.id, a.id);
    await associateLegacySession(keys, legacy.id, a.id);
    const migrated = (await listSessions(keys))[0];
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.classId).toBe(a.id);
    expect(JSON.stringify(migrated.roster)).toBe(roster);
    expect(await db.scanEvents.toArray()).toEqual(events);
    const b = await createClass(keys, { ...base, term: 'Other term' });
    await expect(associateLegacySession(keys, legacy.id, b.id)).rejects.toThrow('another class');
    expect(await classStudents(keys, a.id)).toEqual([]); // Historical association is not enrollment consent.
    await closeSession(keys, migrated);
    await copyLegacyEnrollment(keys, a.id);
    await copyLegacyEnrollment(keys, a.id);
    expect(await db.enrollments.count()).toBe(1);
  });
  it('round-trips v3 classes and memberships and rejects orphan membership before replacement', async () => {
    const a = await createClass(keys, base);
    await saveRoster(keys, [student], a.id);
    const session = await createSession(keys, { ...settings, classId: a.id });
    await closeSession(keys, session);
    await exportBackup(keys);
    const file = new File([vi.mocked(downloadFile).mock.calls[0][0]], 'backup.json');
    const raw = JSON.parse(await file.text());
    expect(raw.v).toBe(3);
    await restoreBackup(file, pin);
    expect((await listClasses(keys))[0].id).toBe(a.id);
    expect((await classStudents(keys, a.id))[0].name).toBe(student.name);
    const data = await decrypt<{ enrollments: Array<{ classId: string; studentToken: string }> }>(
      keys.encryption,
      raw.payload,
      'backup:v3',
    );
    data.enrollments[0].classId = 'missing';
    raw.payload = await encrypt(keys.encryption, data, 'backup:v3');
    await expect(restoreBackup(new File([JSON.stringify(raw)], 'bad.json'), pin)).rejects.toThrow(
      'enrollment',
    );
    expect(await db.classes.count()).toBe(1);
    expect(await db.students.count()).toBe(1);
  });
  it('accepts v1 backups without inventing class associations or retaining stale v2 classes', async () => {
    await saveRoster(keys, [student]);
    const legacy = await createSession(keys, settings);
    await closeSession(keys, legacy);
    const data = {
      students: await db.students.toArray(),
      sessions: await db.sessions.toArray(),
      attendance: await db.attendance.toArray(),
      scanEvents: await db.scanEvents.toArray(),
    };
    const raw = {
      format: 'attendance-desk',
      v: 1,
      meta: await db.meta.get('vault'),
      payload: await encrypt(keys.encryption, data, 'backup:v1'),
    };
    await createClass(keys, base);
    await restoreBackup(new File([JSON.stringify(raw)], 'legacy.json'), pin);
    expect(await db.classes.count()).toBe(0);
    expect(await db.enrollments.count()).toBe(0);
    expect((await listSessions(keys))[0].id).toBe(legacy.id);
    expect((await listSessions(keys))[0].classId).toBeUndefined();
  });
  it('preserves explicit absence even when its reason matches the legacy closure phrase', async () => {
    await saveRoster(keys, [student]);
    const session = await createSession(keys, settings);
    await correctAttendance(
      keys,
      session.id,
      session.roster[0],
      'ABSENT',
      'Not recorded at session closure',
    );
    await closeSession(keys, session);
    const { reopenSession } = await import('../src/domain/attendance');
    await reopenSession(keys, session.id, 'Review attendance');
    expect((await getAttendance(keys, session.id)).get(session.roster[0].token)?.status).toBe(
      'ABSENT',
    );
  });
  it('upgrades the actual v1 schema additively without altering ciphertext', async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      students: '&token, sectionToken',
      sessions: '&id, state',
      scanEvents: '&id, sessionId',
      attendance: '[sessionId+studentToken], sessionId',
      meta: '&id',
    });
    await old.open();
    const meta = await db.meta.get('vault');
    await old.table('meta').add(meta!);
    old.close();
    const upgraded = new AttendanceDatabase(name);
    try {
      await upgraded.open();
      expect(await upgraded.meta.get('vault')).toEqual(meta);
      expect(upgraded.tables.map((table) => table.name)).toContain('enrollments');
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });
  it('updates defaults without rewriting historical session settings or class identity', async () => {
    const a = await createClass(keys, { ...base, timezone: 'Asia/Manila' });
    await saveRoster(keys, [student], a.id);
    const session = await createSession(keys, { ...settings, classId: a.id });
    await updateClassDefaults(keys, a.id, {
      ...base,
      course: 'IGNORED',
      graceMinutes: 30,
      room: 'Lab 2',
      timezone: 'Asia/Singapore',
    });
    const updated = (await listClasses(keys))[0];
    expect(updated.course).toBe(base.course);
    expect(updated.graceMinutes).toBe(30);
    expect((await listSessions(keys))[0].graceMinutes).toBe(15);
    expect((await listSessions(keys))[0].room).toBe(session.room);
    await expect(createClass(keys, base)).rejects.toThrow('already exists');
  });
  it('leaves legacy records unchanged after association failure and supports retry', async () => {
    await saveRoster(keys, [student]);
    const session = await createSession(keys, settings);
    const offering = await createClass(keys, base);
    const original = await db.sessions.get(session.id);
    const failed = vi
      .spyOn(db.sessions, 'update')
      .mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(associateLegacySession(keys, session.id, offering.id)).rejects.toThrow('Quota');
    expect(await db.sessions.get(session.id)).toEqual(original);
    failed.mockRestore();
    await associateLegacySession(keys, session.id, offering.id);
    expect((await listSessions(keys))[0].classId).toBe(offering.id);
  });
  it('keeps navigation busy through an asynchronous operation and releases on failure', async () => {
    let reject!: (error: Error) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const task = teacherOperation(
      () =>
        new Promise<void>((_resolve, rejectTask) => {
          reject = rejectTask;
          began();
        }),
    );
    const result = task();
    expect(isTeacherBusy()).toBe(true);
    await started;
    reject(new Error('Quota'));
    await expect(result).rejects.toThrow('Quota');
    expect(isTeacherBusy()).toBe(false);
  });
});
