import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { decrypt, encrypt } from '../src/db/crypto';
import { unlockVault } from '../src/db/vault';
import { exportBackup, restoreBackup } from '../src/db/backup';
import { downloadFile } from '../src/utils/download';
import { saveRoster, createSession, closeSession } from '../src/domain/attendance';
import { createClass, classStudents } from '../src/domain/classes';
import { importMasterList, readImportSnapshot } from '../src/domain/importMasterList';
import { groupMasterRows, personIdentity } from '../src/domain/masterListDraft';
import { saveTemplate, listTemplates } from '../src/domain/templates';
import type { VaultKeys } from '../src/types';
vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
const pin = '104928573612';
let keys: VaultKeys;
const student = { id: 'CA202304427', displayId: 'CA202304427', name: 'Peña, José', section: 'A' };
const defaults = {
  course: 'IT301',
  section: 'A',
  term: '2026 / 1',
  institution: '',
  subject: '',
  room: '',
  graceMinutes: 15,
  timezone: 'Asia/Manila',
};
const draft = (name = student.name) =>
  groupMasterRows([{ ...student, name, ...defaults, sourceRow: 2 }]);
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault(pin);
  vi.clearAllMocks();
});
async function backupFile(data: unknown, v: 2 | 3) {
  return new File(
    [
      JSON.stringify({
        format: 'attendance-desk',
        v,
        ...(v === 3 ? { schema: 'class-attendance:unified-v3' } : {}),
        meta: await db.meta.get('vault'),
        payload: await encrypt(keys.encryption, data, `backup:v${v}`),
      }),
    ],
    'synthetic.json',
  );
}
async function common() {
  return {
    students: await db.students.toArray(),
    sessions: await db.sessions.toArray(),
    attendance: await db.attendance.toArray(),
    scanEvents: await db.scanEvents.toArray(),
  };
}
describe('unified recovery and reviewed imports', () => {
  it('restores prototypev2 backups with original encrypted classes, snapshots and enrollment', async () => {
    const offering = await createClass(keys, defaults);
    await saveRoster(keys, [student], offering.id);
    const session = await createSession(keys, {
      ...defaults,
      classId: offering.id,
      roomPin: '492',
      startsAt: Date.now(),
    });
    await closeSession(keys, session);
    const data = {
      ...(await common()),
      classes: await db.classes.toArray(),
      enrollments: await db.enrollments.toArray(),
    };
    await restoreBackup(await backupFile(data, 2), pin);
    expect(await db.classes.toArray()).toEqual(data.classes);
    expect(await db.sessions.toArray()).toEqual(data.sessions);
    expect(await db.attendance.toArray()).toEqual(data.attendance);
    expect((await classStudents(keys, offering.id))[0].name).toBe(student.name);
  });
  it('restores modernize templates without inventing course enrollment, then round-trips v3', async () => {
    await saveRoster(keys, [student]);
    await saveTemplate(keys, { name: 'Legacy IT301', settings: defaults });
    const data = { ...(await common()), classTemplates: await db.classTemplates.toArray() };
    await restoreBackup(await backupFile(data, 2), pin);
    expect(await db.classes.count()).toBe(0);
    expect(await db.enrollments.count()).toBe(0);
    expect((await listTemplates(keys))[0].name).toBe('Legacy IT301');
    await exportBackup(keys);
    const envelope = JSON.parse(await vi.mocked(downloadFile).mock.calls[0][0].text());
    expect(envelope.v).toBe(3);
    await restoreBackup(new File([JSON.stringify(envelope)], 'v3.json'), pin);
    expect(await db.classTemplates.toArray()).toEqual(data.classTemplates);
  });
  it('rejects ambiguous version 2 data and failed replacement without altering current records', async () => {
    await saveRoster(keys, [student]);
    const prior = await common();
    await expect(
      restoreBackup(
        await backupFile({ ...prior, classes: [], enrollments: [], classTemplates: [] }, 2),
        pin,
      ),
    ).rejects.toThrow('ambiguous');
    expect(await common()).toEqual(prior);
    const file = await backupFile({ ...prior, classes: [], enrollments: [] }, 2);
    const failure = vi
      .spyOn(db.students, 'bulkAdd')
      .mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(restoreBackup(file, pin)).rejects.toThrow('Quota');
    failure.mockRestore();
    expect(await common()).toEqual(prior);
  });
  it('requires a matching name approval and preserves historical snapshots', async () => {
    const offering = await createClass(keys, defaults);
    await saveRoster(keys, [student], offering.id);
    const session = await createSession(keys, {
      ...defaults,
      classId: offering.id,
      roomPin: '492',
      startsAt: Date.now(),
    });
    await closeSession(keys, session);
    const history = await db.sessions.toArray();
    const snapshot = await readImportSnapshot(keys);
    await expect(
      importMasterList(keys, draft('Updated Name'), { expectedSnapshot: snapshot.fingerprint }),
    ).rejects.toThrow('Name conflict');
    await importMasterList(keys, draft('Updated Name'), {
      expectedSnapshot: snapshot.fingerprint,
      approvals: {
        [personIdentity('A', student.id)]: { before: student.name, after: 'Updated Name' },
      },
    });
    expect((await classStudents(keys, offering.id))[0].name).toBe('Updated Name');
    expect(await db.sessions.toArray()).toEqual(history);
    expect(
      (
        await decrypt<{ roster: { name: string }[] }>(
          keys.encryption,
          history[0].encrypted,
          `session:${session.id}`,
        )
      ).roster[0].name,
    ).toBe(student.name);
  });
  it('rejects a stale preview and leaves unchanged ciphertext intact on repeated imports', async () => {
    await importMasterList(keys, draft());
    const original = await db.students.toArray();
    const snapshot = await readImportSnapshot(keys);
    await importMasterList(keys, draft(), { expectedSnapshot: snapshot.fingerprint });
    expect(await db.students.toArray()).toEqual(original);
    await saveRoster(keys, [
      { id: 'CA202304428', name: 'Another synthetic student', section: 'A' },
    ]);
    const before = await common();
    await expect(
      importMasterList(keys, draft(), { expectedSnapshot: snapshot.fingerprint }),
    ).rejects.toThrow('changed in another tab');
    expect(await common()).toEqual(before);
  });
});
