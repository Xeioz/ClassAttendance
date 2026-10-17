import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import {
  closeSession,
  correctAttendance,
  createSession,
  getAttendance,
  listSessions,
  recordAttendance,
  reopenSession,
  saveRoster,
} from '../src/domain/attendance';
import { flagDispute, readAudit, resolveDispute, unresolvedDisputes } from '../src/domain/audit';
import { attendanceCSV, spreadsheetSafe } from '../src/utils/csvExport';
import { reportFilename, readReportSnapshot } from '../src/domain/reports';
import type { VaultKeys } from '../src/types';
let keys: VaultKeys;
const now = Date.UTC(2026, 9, 17, 16, 30);
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
});
async function fixture() {
  await saveRoster(keys, [
    { id: '001', displayId: '00-1', name: 'Peña, José', section: 'A' },
    { id: '002', name: 'Other Student', section: 'A' },
  ]);
  return createSession(keys, {
    course: 'IT301',
    section: 'A',
    roomPin: '492',
    startsAt: now,
    graceMinutes: 15,
    timezone: 'Asia/Manila',
    institution: 'Test College',
    subject: 'Web Systems',
    room: 'Lab 3',
  });
}
const raw = JSON.stringify({ v: 1, id: '001', ch: '492', ts: now / 1000 });
describe('Phase 3 lifecycle and disputes', () => {
  it('keeps original timestamps across duplicates, disputes and corrections, and blocks unresolved closure', async () => {
    const session = await fixture();
    await recordAttendance(keys, session.id, { raw }, now);
    const duplicate = await recordAttendance(keys, session.id, { raw }, now + 10000);
    expect(duplicate.kind).toBe('duplicate');
    expect(duplicate.firstAt).toBe(now);
    await flagDispute(
      keys,
      session.id,
      duplicate.studentToken!,
      'Identity mismatch',
      duplicate.secondAt,
    );
    const events = await readAudit(keys, session.id);
    const dispute = unresolvedDisputes(events)[0];
    expect(dispute.firstAt).toBe(now);
    expect(dispute.secondAt).toBe(now + 10000);
    await expect(closeSession(keys, session)).rejects.toThrow('Resolve');
    await expect(
      flagDispute(keys, session.id, duplicate.studentToken!, 'Another review'),
    ).rejects.toThrow('already');
    await correctAttendance(
      keys,
      session.id,
      session.roster.find((student) => student.id === '001')!,
      'LATE',
      'Verified in queue',
    );
    expect((await getAttendance(keys, session.id)).get(duplicate.studentToken!)?.originalAt).toBe(
      now,
    );
    await resolveDispute(keys, session.id, dispute.eventId, 'ID card visually verified');
    await expect(
      resolveDispute(keys, session.id, dispute.eventId, 'Resolved again'),
    ).rejects.toThrow('already');
    await closeSession(keys, session);
    expect(unresolvedDisputes(await readAudit(keys, session.id))).toHaveLength(0);
    const change = (await readAudit(keys, session.id)).find(
      (event) => event.action === 'STATUS_CHANGE',
    );
    expect(change?.previousStatus).toBe('PRESENT');
    expect(change?.newStatus).toBe('LATE');
  });
  it('reopening removes only automatic absence and preserves explicit teacher decisions', async () => {
    const session = await fixture();
    const first = session.roster.find((student) => student.id === '001')!;
    await correctAttendance(keys, session.id, first, 'ABSENT', 'Teacher verified absence');
    await closeSession(keys, session);
    await reopenSession(keys, session.id, 'Additional check-ins');
    const records = await getAttendance(keys, session.id);
    expect(records.size).toBe(1);
    expect(records.get(first.token)?.status).toBe('ABSENT');
    expect((await listSessions(keys))[0].state).toBe('ACTIVE');
    await expect(reopenSession(keys, session.id, 'Again')).rejects.toThrow('Only a closed');
  });
  it('allows explicit manual excusal and prevents reopening against another active session', async () => {
    const session = await fixture();
    await recordAttendance(
      keys,
      session.id,
      { student: session.roster[0], reason: 'Varsity activity', status: 'EXCUSED' },
      now,
    );
    await closeSession(keys, session);
    await createSession(keys, {
      course: 'OTHER',
      section: 'A',
      roomPin: '123',
      startsAt: now,
      graceMinutes: 0,
    });
    await expect(reopenSession(keys, session.id, 'Need correction')).rejects.toThrow(
      'other active',
    );
    expect(
      [...(await getAttendance(keys, session.id))].some(([, entry]) => entry.status === 'EXCUSED'),
    ).toBe(true);
  });
});
describe('Phase 3 export snapshot', () => {
  it('retains active pending states, original display ID, metadata, Unicode, and CSV formula guards', async () => {
    const session = await fixture();
    const snapshot = await readReportSnapshot(keys, session.id);
    const csv = attendanceCSV(snapshot.session, snapshot.attendance);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    expect(parsed.find((row) => row['Student ID'] === '00-1')?.Status).toBe('NOT_YET_RECORDED');
    expect(parsed[0].Institution).toBe('Test College');
    expect(reportFilename(session, 'csv')).toBe('IT301_A_Attendance_2026-10-18.csv');
    for (const value of ['=1+1', '+SUM(A1)', '-5+1', '@SUM(A1)', '  =1+1', '\t=1'])
      expect(spreadsheetSafe(value)).toBe(`'${value}`);
    const student = session.roster[0];
    student.name = '=HYPERLINK("https://example.test")';
    const guarded = Papa.parse<Record<string, string>>(attendanceCSV(session, new Map()), {
      header: true,
    }).data;
    expect(guarded[0]['Official name'].startsWith("'=")).toBe(true);
  });
});
