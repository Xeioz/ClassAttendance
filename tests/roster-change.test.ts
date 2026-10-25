import 'fake-indexeddb/auto';
import { readRosterSnapshot } from '../src/domain/rosterSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import * as cryptoModule from '../src/db/crypto';
import {
  closeSession,
  createSession,
  listSessions,
  listStudents,
  recordAttendance,
  saveRoster,
} from '../src/domain/attendance';
import { commitRosterImport, prepareRosterImport } from '../src/domain/rosterImport';
import { StaleRosterPreviewError } from '../src/domain/rosterSnapshot';
import { saveTemplate } from '../src/domain/templates';
import { inspectRoster } from '../src/utils/csv';
import type { SessionPrivate, StudentPrivate, VaultKeys } from '../src/types';

let keys: VaultKeys;
const initial = [
  { id: '001', displayId: '00-1', name: 'Alex Original', section: 'A' },
  { id: '002', name: 'Same Name', section: 'A' },
  { id: '003', name: 'Omitted Student', section: 'A' },
];
const settings = {
  course: 'IT101',
  section: 'A',
  roomPin: '492',
  startsAt: 1_800_000_000_000,
  graceMinutes: 15,
  timezone: 'Asia/Manila',
};
const csv = (rows: string) => new File([`id,name,section\n${rows}`], 'roster.csv');
async function review(rows: string) {
  return prepareRosterImport(keys, await inspectRoster(csv(rows), 'auto'));
}

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
});
afterEach(() => vi.restoreAllMocks());

describe('reviewed roster changes', () => {
  it('reconciles every parsed row, including invalid and colliding identities, without matching by name', async () => {
    await saveRoster(keys, initial);
    const result = await review(
      '001,Alex Renamed,A\n002,Same Name,A\n004,Same Name,A\n,Missing ID,A\n005,,A\nAB-12,First,A\nA-B12,Second,A\n006,Same ID other section,B\n006,Same ID current section,A',
    );
    expect(result.counts).toEqual({ added: 3, updated: 1, unchanged: 1, invalid: 2, conflict: 2 });
    expect(Object.values(result.counts).reduce((sum, n) => sum + n, 0)).toBe(9);
    expect(result.rows[0]).toMatchObject({
      before: { displayId: '00-1', name: 'Alex Original' },
      student: { id: '001', displayId: '001', name: 'Alex Renamed' },
    });
    expect(result.rows[3].raw).toEqual({ id: '', name: 'Missing ID', section: 'A' });
    expect(result.rows[5].issue).toContain('7, 8');
    const before = await db.students.toArray();
    await expect(commitRosterImport(keys, result, new Set([2]))).rejects.toThrow(
      'Nothing can be saved',
    );
    expect(await db.students.toArray()).toEqual(before);
  });

  it('retains malformed CSV field-count rows for correction', async () => {
    const parsed = await inspectRoster(csv('001,Name\n002,Name,A,extra\n003,Valid,A'), 'auto');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.map((row) => row.issueKind)).toEqual(['invalid', 'invalid', undefined]);
    expect(parsed.rows[0].issue).toContain('different number of fields');
  });

  it('requires approval of conflicting existing details, commits exact counts, and preserves omitted students and history', async () => {
    await saveRoster(keys, initial);
    const session = await createSession(keys, settings);
    await recordAttendance(
      keys,
      session.id,
      { raw: JSON.stringify({ v: 1, id: '001', ch: '492', ts: settings.startsAt / 1000 }) },
      settings.startsAt,
    );
    await closeSession(keys, session);
    const historyBefore = {
      sessions: await db.sessions.toArray(),
      attendance: await db.attendance.toArray(),
      events: await db.scanEvents.toArray(),
    };
    const unchangedBefore = (await listStudents(keys)).find((student) => student.id === '002')!;
    const unchangedEncrypted = await db.students.get(unchangedBefore.token);
    const comparison = await review('001,Alex Renamed,A\n002,Same Name,A\n004,Same Name,A');
    await expect(commitRosterImport(keys, comparison, new Set())).rejects.toThrow(
      'Confirm each changed identity',
    );
    expect(await commitRosterImport(keys, comparison, new Set([2]))).toEqual({
      added: 1,
      updated: 1,
      unchanged: 1,
      invalid: 0,
      conflict: 0,
    });
    const students = await listStudents(keys);
    expect(students).toHaveLength(4);
    expect(students.find((student) => student.id === '003')?.name).toBe('Omitted Student');
    expect(students.find((student) => student.id === '001')).toMatchObject({
      id: '001',
      displayId: '001',
      name: 'Alex Renamed',
    });
    expect(await db.students.get(unchangedBefore.token)).toEqual(unchangedEncrypted);
    expect({
      sessions: await db.sessions.toArray(),
      attendance: await db.attendance.toArray(),
      events: await db.scanEvents.toArray(),
    }).toEqual(historyBefore);
    expect((await listSessions(keys))[0].roster.find((student) => student.id === '001')?.name).toBe(
      'Alex Original',
    );
  });

  it('makes no-change saves true no-ops, including encrypted values', async () => {
    await saveRoster(keys, initial);
    const comparison = await review('00-1,Alex Original,A\n002,Same Name,A');
    const before = await db.students.toArray();
    const bulkPut = vi.spyOn(db.students, 'bulkPut');
    await commitRosterImport(keys, comparison, new Set());
    await commitRosterImport(keys, comparison, new Set());
    expect(bulkPut).not.toHaveBeenCalled();
    expect(await db.students.toArray()).toEqual(before);
  });

  it('rejects stale reviewed data and allows a refreshed comparison to be reviewed again', async () => {
    await saveRoster(keys, initial);
    const earlier = await review('00-1,Approved Later,A');
    await saveRoster(keys, [{ ...initial[0], name: 'Changed in another tab' }], {
      expectedVersion: (await readRosterSnapshot(keys)).version,
    });
    const before = await db.students.toArray();
    await expect(commitRosterImport(keys, earlier, new Set([2]))).rejects.toBeInstanceOf(
      StaleRosterPreviewError,
    );
    expect(await db.students.toArray()).toEqual(before);
    const fresh = await prepareRosterImport(keys, earlier.inspection);
    expect(fresh.rows[0].before?.name).toBe('Changed in another tab');
    await commitRosterImport(keys, fresh, new Set([2]));
    expect((await listStudents(keys)).find((student) => student.id === '001')?.name).toBe(
      'Approved Later',
    );
  });

  it('rolls back a failure after a partial underlying write', async () => {
    await saveRoster(keys, initial);
    const comparison = await review('004,First New,A\n005,Second New,A');
    const before = await db.students.toArray();
    vi.spyOn(db.students, 'bulkPut').mockImplementationOnce((rows) =>
      db.students.put(rows[0]).then(() => {
        throw new Error('Synthetic storage failure after first write');
      }),
    );
    await expect(commitRosterImport(keys, comparison, new Set())).rejects.toThrow(
      'Synthetic storage failure',
    );
    expect(await db.students.toArray()).toEqual(before);
  });

  it('prevents duplicate students from concurrent repeated submissions', async () => {
    const comparison = await review('001,First,A\n002,Second,A');
    const results = await Promise.allSettled([
      commitRosterImport(keys, comparison, new Set()),
      commitRosterImport(keys, comparison, new Set()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await db.students.count()).toBe(2);
    await expect(commitRosterImport(keys, comparison, new Set())).rejects.toBeInstanceOf(
      StaleRosterPreviewError,
    );
    const refreshed = await prepareRosterImport(keys, comparison.inspection);
    expect(refreshed.counts.unchanged).toBe(2);
    await commitRosterImport(keys, refreshed, new Set());
    expect(await db.students.count()).toBe(2);
  });

  it('checks for roster drift inside the write transaction, after encryption completes', async () => {
    await saveRoster(keys, initial);
    const comparison = await review('004,Incoming Student,A');
    const original = (await db.students.toArray())[0];
    const decoded = (await listStudents(keys)).find((row) => row.token === original.token)!;
    const replacement = {
      ...original,
      encrypted: await cryptoModule.encrypt(
        keys.encryption,
        { ...decoded, name: 'Concurrent Change' },
        `student:${original.token}`,
      ),
    };
    const encrypt = cryptoModule.encrypt;
    let injected = false;
    vi.spyOn(cryptoModule, 'encrypt').mockImplementation(async (...args) => {
      const encrypted = await encrypt(...args);
      if (!injected && args[2].startsWith('student:')) {
        injected = true;
        await db.students.put(replacement);
      }
      return encrypted;
    });
    await expect(commitRosterImport(keys, comparison, new Set())).rejects.toBeInstanceOf(
      StaleRosterPreviewError,
    );
    expect(await db.students.count()).toBe(3);
    expect(await db.students.get(original.token)).toEqual(replacement);
  });

  it('blocks a reviewed import when a session becomes active before save', async () => {
    await saveRoster(keys, initial);
    const comparison = await review('004,New,A');
    await createSession(keys, settings);
    await expect(commitRosterImport(keys, comparison, new Set())).rejects.toThrow(
      'Close active sessions',
    );
    expect(await db.students.count()).toBe(3);
  });
});

describe('session roster consistency', () => {
  it('rejects drift from the roster shown in the UI before the start click', async () => {
    await saveRoster(keys, initial);
    const expectedRoster = await listStudents(keys);
    await saveRoster(keys, [{ id: '004', name: 'New Student', section: 'A' }]);
    await expect(createSession(keys, settings, { expectedRoster })).rejects.toBeInstanceOf(
      StaleRosterPreviewError,
    );
    expect(await db.sessions.count()).toBe(0);
    const session = await createSession(keys, settings, {
      expectedRoster: await listStudents(keys),
    });
    expect(session.roster).toHaveLength(4);
  });

  it('rejects a roster update during session encryption, with no session committed', async () => {
    await saveRoster(keys, initial);
    const original = (await db.students.toArray())[0];
    const decoded = (await listStudents(keys)).find((row) => row.token === original.token)!;
    const replacement = {
      ...original,
      encrypted: await cryptoModule.encrypt(
        keys.encryption,
        { ...decoded, name: 'During Session Creation' },
        `student:${original.token}`,
      ),
    };
    const encrypt = cryptoModule.encrypt;
    vi.spyOn(cryptoModule, 'encrypt').mockImplementation(async (...args) => {
      const encrypted = await encrypt(...args);
      if (args[2].startsWith('session:')) await db.students.put(replacement);
      return encrypted;
    });
    await expect(createSession(keys, settings)).rejects.toBeInstanceOf(StaleRosterPreviewError);
    expect(await db.sessions.count()).toBe(0);
  });

  it('uses the current roster with saved template settings and validates session-only runtime values', async () => {
    await saveRoster(keys, initial);
    const template = await saveTemplate(keys, { name: 'Class A', settings });
    await saveRoster(keys, [{ id: '004', name: 'New Student', section: 'A' }]);
    for (const startsAt of [null, '1800000000000', 1.5, NaN]) {
      await expect(
        createSession(keys, { ...settings, startsAt } as unknown as Omit<SessionPrivate, 'roster'>),
      ).rejects.toThrow('Invalid start time');
    }
    await expect(
      createSession(keys, { ...settings, roomPin: 492 } as unknown as Omit<
        SessionPrivate,
        'roster'
      >),
    ).rejects.toThrow('room challenge');
    const session = await createSession(keys, {
      ...template.settings,
      roomPin: '492',
      startsAt: settings.startsAt,
      closedAt: 1,
    });
    expect(session.roster).toHaveLength(4);
    expect(session.closedAt).toBeUndefined();
  });

  it('validates display spelling against canonical IDs before any write', async () => {
    await expect(
      saveRoster(keys, [
        { id: '001', displayId: '002', name: 'Wrong', section: 'A' } as StudentPrivate,
      ]),
    ).rejects.toThrow('same canonical');
    expect(await db.students.count()).toBe(0);
  });
});
