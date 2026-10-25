import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import {
  closeSession,
  correctAttendance,
  createSession,
  getAttendance,
  listSessions,
  listStudents,
  recordAttendance,
  reopenSession,
  saveRoster,
} from '../src/domain/attendance';
import { exportBackup, restoreBackup } from '../src/db/backup';
import { downloadFile } from '../src/utils/download';
import type { VaultKeys } from '../src/types';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
let keys: VaultKeys;
const pin = '104928573612';
const now = 1_800_000_000_000;
async function fixture() {
  await saveRoster(keys, [
    { id: '2024-001', name: 'Peña, José', section: 'A' },
    { id: '2024-002', name: 'Dela Cruz, Ana', section: 'A' },
  ]);
  return createSession(keys, {
    course: 'IT101',
    section: 'A',
    roomPin: '492',
    startsAt: now,
    graceMinutes: 15,
  });
}
function raw(id = '2024001') {
  return JSON.stringify({ v: 1, id, ch: '492', ts: now / 1000 });
}
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  vi.clearAllMocks();
  keys = await unlockVault(pin);
});
describe('attendance transactions', () => {
  it('writes one attendance record under concurrent repeated scans', async () => {
    const session = await fixture();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => recordAttendance(keys, session.id, { raw: raw() }, now)),
    );
    expect(results.filter((result) => result.kind === 'valid')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'duplicate')).toHaveLength(7);
    expect(await db.attendance.count()).toBe(1);
    expect(await db.scanEvents.count()).toBe(8);
    expect(JSON.stringify(await db.students.toArray())).not.toContain('Peña');
    expect(JSON.stringify(await db.sessions.toArray())).not.toContain('IT101');
  });
  it('does not enroll unknown students or count them as present', async () => {
    const session = await fixture();
    expect((await recordAttendance(keys, session.id, { raw: raw('999') }, now)).kind).toBe(
      'unknown',
    );
    expect(await db.attendance.count()).toBe(0);
    expect(await db.students.count()).toBe(2);
  });
  it('resumes committed history, closes unrecorded students absent, and prevents later scans', async () => {
    const session = await fixture();
    await recordAttendance(keys, session.id, { raw: raw() }, now);
    db.close();
    await db.open();
    expect((await listSessions(keys))[0].state).toBe('ACTIVE');
    await closeSession(keys, session);
    const records = await getAttendance(keys, session.id);
    expect([...records.values()].map((row) => row.status).sort()).toEqual(['ABSENT', 'PRESENT']);
    await expect(recordAttendance(keys, session.id, { raw: raw() }, now)).rejects.toThrow('closed');
  });
  it('preserves historical roster snapshots and logs reasoned corrections', async () => {
    const session = await fixture();
    await expect(saveRoster(keys, [{ id: '3', name: 'Other', section: 'A' }])).rejects.toThrow(
      'Close',
    );
    await closeSession(keys, session);
    await expect(
      correctAttendance(keys, session.id, session.roster[0], 'EXCUSED', 'Approved absence'),
    ).rejects.toThrow('Reopen');
    await reopenSession(keys, session.id, 'Correct excused student');
    await correctAttendance(keys, session.id, session.roster[0], 'EXCUSED', 'Approved absence');
    expect((await getAttendance(keys, session.id)).get(session.roster[0].token)?.status).toBe(
      'EXCUSED',
    );
    await closeSession(keys, session);
    await expect(
      saveRoster(keys, [{ id: '2024-001', name: 'New Name', section: 'A' }]),
    ).rejects.toThrow('Name conflict');
    expect((await listSessions(keys))[0].roster.find((row) => row.id === '2024001')?.name).toBe(
      'Peña, José',
    );
    expect(await db.scanEvents.count()).toBe(4);
  });
  it('rejects wrong PINs and conflicting active sessions', async () => {
    await fixture();
    await expect(unlockVault('104928573613')).rejects.toThrow('Unable to decrypt');
    await expect(
      createSession(keys, {
        course: 'IT102',
        section: 'A',
        roomPin: '123',
        startsAt: now,
        graceMinutes: 15,
      }),
    ).rejects.toThrow('Only one');
  });
  it('rolls back attendance when audit persistence fails', async () => {
    const session = await fixture();
    const spy = vi.spyOn(db.scanEvents, 'add').mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(recordAttendance(keys, session.id, { raw: raw() }, now)).rejects.toThrow('Quota');
    expect(await db.attendance.count()).toBe(0);
    spy.mockRestore();
  });
});
describe('encrypted backup recovery', () => {
  it('restores records after local deletion and rejects a wrong PIN without changing current data', async () => {
    const session = await fixture();
    await recordAttendance(keys, session.id, { raw: raw() }, now);
    await exportBackup(keys);
    const blob = vi.mocked(downloadFile).mock.calls[0][0];
    const file = new File([blob], 'backup.json');
    await expect(restoreBackup(file, '104928573613')).rejects.toThrow();
    expect(await db.attendance.count()).toBe(1);
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await restoreBackup(file, pin);
    const restoredKeys = await unlockVault(pin);
    expect((await listStudents(restoredKeys)).find((row) => row.id === '2024001')?.name).toBe(
      'Peña, José',
    );
    expect((await getAttendance(restoredKeys, session.id)).size).toBe(1);
  });
  it('rejects truncated backups without deleting existing data', async () => {
    await fixture();
    await expect(
      restoreBackup(new File(['{"format":"attendance-desk"}'], 'bad.json'), pin),
    ).rejects.toThrow('format');
    expect(await db.students.count()).toBe(2);
  });
});
