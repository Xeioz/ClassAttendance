import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import { normalizeId, sectionKey } from '../utils/normalize';
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
  if ((await db.meta.get('vault'))?.salt !== keys.salt)
    throw new Error('The vault changed in another tab. Lock and unlock again.');
}

export async function saveRoster(keys: VaultKeys, rows: StudentPrivate[]): Promise<void> {
  if (!rows.length || rows.length > 10000) throw new Error('Import between 1 and 10,000 students.');
  const seen = new Set<string>();
  const encrypted = await Promise.all(
    rows.map(async (row) => {
      const id = normalizeId(row.id);
      const section = sectionKey(row.section);
      if (!row.name.trim() || row.name.length > 200 || !section || section.length > 100)
        throw new Error('Every row needs a valid name and section.');
      const identity = `${section}:${id}`;
      if (seen.has(identity)) throw new Error(`Duplicate or colliding student ID: ${row.id}`);
      seen.add(identity);
      const token = await privateToken(keys, `student:${identity}`);
      return {
        token,
        sectionToken: await privateToken(keys, `section:${section}`),
        encrypted: await encrypt(
          keys.encryption,
          { id, displayId: row.displayId ?? row.id.trim(), name: row.name.trim(), section },
          `student:${token}`,
        ),
      };
    }),
  );
  await db.transaction('rw', [db.students, db.sessions, db.meta], async () => {
    await assertVault(keys);
    if (await db.sessions.where('state').equals('ACTIVE').count())
      throw new Error('Close active sessions before importing a roster.');
    // Merge on the section + canonical ID; historical sessions retain encrypted roster snapshots.
    await db.students.bulkPut(encrypted);
  });
}
export async function listStudents(keys: VaultKeys): Promise<Student[]> {
  return Promise.all(
    (await db.students.toArray()).map(async (row) => ({
      token: row.token,
      ...(await decrypt<StudentPrivate>(keys.encryption, row.encrypted, `student:${row.token}`)),
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
): Promise<Session> {
  if (!input.course.trim() || input.course.length > 100 || !/^\d{3,6}$/.test(input.roomPin))
    throw new Error('Enter a course and a 3–6 digit room challenge.');
  if (
    !Number.isFinite(new Date(input.startsAt).getTime()) ||
    !Number.isInteger(input.graceMinutes) ||
    input.graceMinutes < 0 ||
    input.graceMinutes > 180
  )
    throw new Error('Invalid start time or grace period.');
  const roster = (await listStudents(keys)).filter(
    (row) => row.section === sectionKey(input.section),
  );
  if (!roster.length) throw new Error('Import students for this section first.');
  const id = crypto.randomUUID();
  const data: SessionPrivate = {
    ...input,
    course: input.course.trim(),
    section: sectionKey(input.section),
    roster,
    timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  for (const value of [data.institution, data.subject, data.room])
    if (value !== undefined && value.length > 150)
      throw new Error('Report metadata must be at most 150 characters per field.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format(input.startsAt);
  } catch {
    throw new Error('Invalid session timezone.');
  }
  const row: SessionRow = {
    id,
    state: 'ACTIVE',
    encrypted: await encrypt(keys.encryption, data, `session:${id}`),
  };
  await db.transaction('rw', [db.sessions, db.meta], async () => {
    await assertVault(keys);
    if (await db.sessions.where('state').equals('ACTIVE').count())
      throw new Error('Only one session can be active. Resume or close it first.');
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
