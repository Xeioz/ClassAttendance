import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import { normalizeRosterStudent, sameRosterStudent } from '../utils/rosterValidation';
import { readRosterSnapshot, rosterVersion, StaleRosterPreviewError } from './rosterSnapshot';
import { validateClassSettings } from './classSettings';
import { t } from '../i18n';
import type {
  AttendancePrivate,
  Session,
  SessionPrivate,
  SessionRow,
  Student,
  StudentPrivate,
  VaultKeys,
} from '../types';

async function assertVault(keys: VaultKeys): Promise<void> {
  if ((await db.meta.get('vault'))?.salt !== keys.salt) throw new Error(t('session.vaultChanged'));
}

export async function saveRoster(
  keys: VaultKeys,
  rows: StudentPrivate[],
  options: { expectedVersion?: string } = {},
): Promise<void> {
  if (!rows.length || rows.length > 10000) throw new Error(t('roster.rowLimit'));
  const seen = new Set<string>();
  const normalized = rows.map((row) => {
    const student = normalizeRosterStudent(row);
    const identity = `${student.section}:${student.id}`;
    if (seen.has(identity)) throw new Error(t('roster.duplicateIdentity', { id: row.id }));
    seen.add(identity);
    return student;
  });
  const snapshot = await readRosterSnapshot(keys);
  if (options.expectedVersion !== undefined && options.expectedVersion !== snapshot.version)
    throw new StaleRosterPreviewError();
  const current = new Map(
    snapshot.students.map((student) => [`${student.section}:${student.id}`, student]),
  );
  // Unchanged rows retain their exact encrypted contents; omitted rows remain in the roster.
  const changes = normalized.filter((student) => {
    const before = current.get(`${student.section}:${student.id}`);
    return !before || !sameRosterStudent(before, student);
  });
  const encrypted = await Promise.all(
    changes.map(async (row) => {
      const identity = `${row.section}:${row.id}`;
      const token = await privateToken(keys, `student:${identity}`);
      return {
        token,
        sectionToken: await privateToken(keys, `section:${row.section}`),
        encrypted: await encrypt(keys.encryption, row, `student:${token}`),
      };
    }),
  );
  await db.transaction('rw', [db.students, db.sessions, db.meta], async () => {
    await assertVault(keys);
    if (await db.sessions.where('state').equals('ACTIVE').count())
      throw new Error(t('roster.closeActive'));
    if (rosterVersion(await db.students.toArray()) !== snapshot.version)
      throw new StaleRosterPreviewError();
    // Merge on the section + canonical ID; historical sessions retain encrypted roster snapshots.
    if (encrypted.length) await db.students.bulkPut(encrypted);
  });
}
export async function listStudents(keys: VaultKeys): Promise<Student[]> {
  return Promise.all(
    (await db.students.toArray()).map(async (row) => ({
      ...(await decrypt<StudentPrivate>(keys.encryption, row.encrypted, `student:${row.token}`)),
      token: row.token,
    })),
  );
}
export async function listSessions(keys: VaultKeys): Promise<Session[]> {
  return Promise.all((await db.sessions.toArray()).map((row) => decodeSession(keys, row)));
}
async function decodeSession(keys: VaultKeys, row: SessionRow): Promise<Session> {
  return {
    ...(await decrypt<SessionPrivate>(keys.encryption, row.encrypted, `session:${row.id}`)),
    id: row.id,
    state: row.state,
  };
}
export async function createSession(
  keys: VaultKeys,
  input: Omit<SessionPrivate, 'roster'>,
  options: { expectedRoster?: Student[] } = {},
): Promise<Session> {
  const settings = validateClassSettings(input);
  if (typeof input.roomPin !== 'string' || !/^\d{3,6}$/.test(input.roomPin))
    throw new Error(t('session.challengeInvalid'));
  if (
    typeof input.startsAt !== 'number' ||
    !Number.isSafeInteger(input.startsAt) ||
    !Number.isFinite(new Date(input.startsAt).getTime())
  )
    throw new Error(t('session.startInvalid'));
  const snapshot = await readRosterSnapshot(keys);
  const roster = snapshot.students.filter((row) => row.section === settings.section);
  if (options.expectedRoster) {
    const expected = options.expectedRoster.filter(
      (student) => student.section === settings.section,
    );
    const current = new Map(roster.map((student) => [student.token, student]));
    if (
      expected.length !== roster.length ||
      expected.some((student) => {
        const actual = current.get(student.token);
        return !actual || !sameRosterStudent(student, actual);
      })
    )
      throw new StaleRosterPreviewError();
  }
  if (!roster.length) throw new Error(t('session.rosterRequired'));
  const id = crypto.randomUUID();
  const data: SessionPrivate = {
    ...settings,
    roomPin: input.roomPin,
    startsAt: input.startsAt,
    roster,
  };
  const row: SessionRow = {
    id,
    state: 'ACTIVE',
    encrypted: await encrypt(keys.encryption, data, `session:${id}`),
  };
  await db.transaction('rw', [db.sessions, db.students, db.meta], async () => {
    await assertVault(keys);
    if (await db.sessions.where('state').equals('ACTIVE').count())
      throw new Error(t('session.activeExists'));
    if (rosterVersion(await db.students.toArray()) !== snapshot.version)
      throw new StaleRosterPreviewError();
    await db.sessions.add(row);
  });
  return { ...data, id, state: 'ACTIVE' };
}
export async function getAttendance(
  keys: VaultKeys,
  sessionId: string,
): Promise<Map<string, AttendancePrivate>> {
  const rows = await db.attendance.where('sessionId').equals(sessionId).toArray();
  return new Map(
    await Promise.all(
      rows.map(
        async (row) =>
          [
            row.studentToken,
            await decrypt<AttendancePrivate>(
              keys.encryption,
              row.encrypted,
              `attendance:${sessionId}:${row.studentToken}`,
            ),
          ] as const,
      ),
    ),
  );
}

export { recordAttendance, correctAttendance } from './checkIn';
export { closeSession, reopenSession } from './sessionLifecycle';
