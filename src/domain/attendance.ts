import { t } from '../i18n';
import { normalizeRosterStudent, sameRosterStudent } from '../utils/rosterValidation';
import { readRosterSnapshot, rosterVersion, StaleRosterPreviewError } from './rosterSnapshot';
import { validateClassSettings } from './classSettings';
import { teacherOperation } from './operations';
import Dexie from 'dexie';
import { classStudents, listClasses } from './classes';
import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import { sectionKey } from '../utils/normalize';
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

async function saveRosterInternal(
  keys: VaultKeys,
  rows: StudentPrivate[],
  classOrOptions?: string | { expectedVersion?: string; classId?: string },
): Promise<void> {
  const options =
    typeof classOrOptions === 'string' ? { classId: classOrOptions } : (classOrOptions ?? {});
  const classId = options.classId;
  const offering = classId
    ? (await listClasses(keys)).find((item) => item.id === classId)
    : undefined;
  if (classId && !offering) throw new Error('Class not found.');
  if (!rows.length || rows.length > 10000) throw new Error(t('roster.rowLimit'));
  const seen = new Set<string>();
  const normalized = rows.map((row) => {
    const student = normalizeRosterStudent(row);
    if (offering && offering.section !== student.section)
      throw new Error('CSV section does not match the selected class.');
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
  for (const student of normalized) {
    const previous = current.get(`${student.section}:${student.id}`);
    if (previous && previous.name !== student.name && options.expectedVersion === undefined)
      throw new Error(
        `Name conflict for ${student.id}: existing name is ${previous.name}. Review and approve the changes first.`,
      );
  }
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
  await db.transaction(
    'rw',
    [db.students, db.sessions, db.meta, db.classes, db.enrollments],
    async () => {
      await assertVault(keys);
      if (await db.sessions.where('state').equals('ACTIVE').count())
        throw new Error(t('roster.closeActive'));
      if (rosterVersion(await db.students.toArray()) !== snapshot.version)
        throw new StaleRosterPreviewError();
      if (classId && !(await db.classes.get(classId))) throw new Error('Class changed. Refresh.');
      // Merge on the section + canonical ID; historical sessions retain encrypted roster snapshots.
      if (encrypted.length) await db.students.bulkPut(encrypted);
      if (classId) {
        const memberships = await Dexie.waitFor(
          Promise.all(
            normalized.map(async (student) => ({
              classId,
              studentToken: await privateToken(keys, `student:${student.section}:${student.id}`),
            })),
          ),
        );
        await db.enrollments.bulkPut(memberships);
      }
    },
  );
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
async function createSessionInternal(
  keys: VaultKeys,
  input: Omit<SessionPrivate, 'roster'>,
  options: { expectedRoster?: Student[] } = {},
): Promise<Session> {
  if (
    typeof input.course !== 'string' ||
    !input.course.trim() ||
    input.course.length > 100 ||
    typeof input.roomPin !== 'string' ||
    !/^\d{3,6}$/.test(input.roomPin)
  )
    throw new Error('Enter a course and a 3–6 digit room challenge.');
  if (
    typeof input.startsAt !== 'number' ||
    !Number.isSafeInteger(input.startsAt) ||
    !Number.isFinite(new Date(input.startsAt).getTime()) ||
    !Number.isInteger(input.graceMinutes) ||
    input.graceMinutes < 0 ||
    input.graceMinutes > 180
  )
    throw new Error('Invalid start time or grace period.');
  const offering = input.classId
    ? (await listClasses(keys)).find((item) => item.id === input.classId)
    : undefined;
  if (
    input.classId &&
    (!offering ||
      offering.course !== input.course.trim() ||
      offering.section !== sectionKey(input.section))
  )
    throw new Error('Session does not match the selected class.');
  const snapshot = await readRosterSnapshot(keys);
  const roster = input.classId
    ? await classStudents(keys, input.classId)
    : snapshot.students.filter((row) => row.section === sectionKey(input.section));
  if (
    options.expectedRoster &&
    (options.expectedRoster.length !== roster.length ||
      options.expectedRoster.some((expected) => {
        const actual = roster.find((item) => item.token === expected.token);
        return !actual || !sameRosterStudent(actual, expected);
      }))
  )
    throw new StaleRosterPreviewError();
  if (!roster.length) throw new Error('Import students for this section first.');
  const id = crypto.randomUUID();
  const data: SessionPrivate = {
    ...validateClassSettings(input),
    classId: input.classId,
    roomPin: input.roomPin,
    startsAt: input.startsAt,
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
  await db.transaction(
    'rw',
    [db.sessions, db.meta, db.classes, db.enrollments, db.students],
    async () => {
      await assertVault(keys);
      if (await db.sessions.where('state').equals('ACTIVE').count())
        throw new Error('Only one session can be active. Resume or close it first.');
      if (input.classId) {
        if (!(await db.classes.get(input.classId))) throw new Error('Class no longer exists.');
        const membership = await db.enrollments.where('classId').equals(input.classId).toArray();
        if (
          membership.length !== roster.length ||
          membership.some((item) => !roster.some((student) => student.token === item.studentToken))
        )
          throw new Error('Enrollment changed. Retry.');
      }
      if (rosterVersion(await db.students.toArray()) !== snapshot.version)
        throw new StaleRosterPreviewError();
      await db.sessions.add(row);
    },
  );
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

export const saveRoster = teacherOperation(saveRosterInternal);

export const createSession = teacherOperation(createSessionInternal);
