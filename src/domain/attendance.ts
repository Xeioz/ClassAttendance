import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import { normalizeId, sectionKey } from '../utils/normalize';
import { parseQR, punctuality } from './qr';
import type {
  AttendancePrivate,
  AttendanceRow,
  ScanResult,
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
          { id, name: row.name.trim(), section },
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
    !Number.isFinite(input.startsAt) ||
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
  };
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

export async function recordAttendance(
  keys: VaultKeys,
  sessionId: string,
  input: { raw: string } | { student: Student; reason: string },
  now = Date.now(),
): Promise<ScanResult> {
  const stored = await db.sessions.get(sessionId);
  if (!stored || stored.state !== 'ACTIVE')
    throw new Error('This session is closed or unavailable.');
  const session = await decodeSession(keys, stored);
  const id = 'raw' in input ? parseQR(input.raw, session.roomPin, now).id : input.student.id;
  const student = session.roster.find((row) => row.id === id);
  if (
    'student' in input &&
    (!student ||
      input.student.token !== student.token ||
      input.reason.trim().length < 3 ||
      input.reason.length > 500)
  )
    throw new Error(
      'Manual attendance requires an enrolled student and a reason (3–500 characters).',
    );
  const eventId = crypto.randomUUID();
  const event = {
    id: eventId,
    sessionId,
    encrypted: await encrypt(
      keys.encryption,
      {
        id,
        at: now,
        source: 'raw' in input ? 'QR' : 'MANUAL',
        outcome: student ? 'ATTEMPT' : 'UNLISTED',
      },
      `event:${eventId}`,
    ),
  };
  const attendance: AttendancePrivate = {
    status: punctuality(now, session.startsAt, session.graceMinutes),
    at: now,
    source: 'raw' in input ? 'QR' : 'MANUAL',
    ...('reason' in input ? { reason: input.reason.trim() } : {}),
  };
  const row: AttendanceRow | null = student
    ? {
        sessionId,
        studentToken: student.token,
        encrypted: await encrypt(
          keys.encryption,
          attendance,
          `attendance:${sessionId}:${student.token}`,
        ),
      }
    : null;
  const result = await db.transaction(
    'rw',
    [db.sessions, db.attendance, db.scanEvents, db.meta],
    async () => {
      await assertVault(keys);
      if ((await db.sessions.get(sessionId))?.state !== 'ACTIVE')
        throw new Error('Session closed before saving. Attendance was not recorded.');
      await db.scanEvents.add(event);
      if (!student || !row) return 'unknown' as const;
      if (await db.attendance.get([sessionId, student.token])) return 'duplicate' as const;
      await db.attendance.add(row);
      return 'valid' as const;
    },
  );
  // Nothing reports success until the entire transaction has completed.
  if (result === 'unknown')
    return {
      kind: result,
      title: 'Not in this roster',
      detail: `${id} · Use roster review; enrollment has not been changed.`,
    };
  if (result === 'duplicate') {
    const existing = (await getAttendance(keys, sessionId)).get(student!.token);
    return {
      kind: result,
      title: 'Already recorded',
      detail: `${student!.name} · ${existing?.status} · ${new Date(existing?.at ?? now).toLocaleTimeString()}`,
    };
  }
  return {
    kind: 'valid',
    title: `${attendance.status === 'LATE' ? 'Late' : 'Present'} · Saved`,
    detail: `${student!.name} · ${student!.id} · ${new Date(now).toLocaleTimeString()}`,
  };
}
export async function correctAttendance(
  keys: VaultKeys,
  sessionId: string,
  student: Student,
  status: AttendancePrivate['status'],
  reason: string,
): Promise<void> {
  if (
    !['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].includes(status) ||
    reason.trim().length < 3 ||
    reason.length > 500
  )
    throw new Error('Choose a valid status and enter a reason (3–500 characters).');
  const session = await db.sessions.get(sessionId);
  if (
    !session ||
    !(await decodeSession(keys, session)).roster.some((row) => row.token === student.token)
  )
    throw new Error('Student does not belong to this session.');
  const prior = await db.attendance.get([sessionId, student.token]);
  const at = Date.now();
  const eventId = crypto.randomUUID();
  const record = await encrypt(
    keys.encryption,
    { status, at, source: 'MANUAL', reason: reason.trim() },
    `attendance:${sessionId}:${student.token}`,
  );
  const event = await encrypt(
    keys.encryption,
    {
      studentToken: student.token,
      before: prior?.encrypted ?? null,
      status,
      reason: reason.trim(),
      at,
      source: 'CORRECTION',
    },
    `event:${eventId}`,
  );
  await db.transaction('rw', [db.attendance, db.scanEvents, db.sessions, db.meta], async () => {
    await assertVault(keys);
    if (!(await db.sessions.get(sessionId))) throw new Error('The session no longer exists.');
    const current = await db.attendance.get([sessionId, student.token]);
    if (JSON.stringify(current) !== JSON.stringify(prior))
      throw new Error('Attendance changed in another operation. Refresh and retry.');
    await db.attendance.put({ sessionId, studentToken: student.token, encrypted: record });
    await db.scanEvents.add({ id: eventId, sessionId, encrypted: event });
  });
}
export async function closeSession(keys: VaultKeys, session: Session): Promise<void> {
  const at = Date.now();
  const candidates = await Promise.all(
    session.roster.map(async (student) => ({
      sessionId: session.id,
      studentToken: student.token,
      encrypted: await encrypt(
        keys.encryption,
        { status: 'ABSENT', at, source: 'MANUAL', reason: 'Not recorded at session closure' },
        `attendance:${session.id}:${student.token}`,
      ),
    })),
  );
  const eventId = crypto.randomUUID();
  const event = await encrypt(
    keys.encryption,
    { source: 'SESSION_CLOSED', at },
    `event:${eventId}`,
  );
  await db.transaction('rw', [db.sessions, db.attendance, db.scanEvents, db.meta], async () => {
    await assertVault(keys);
    if ((await db.sessions.get(session.id))?.state !== 'ACTIVE')
      throw new Error('Session is already closed.');
    for (const row of candidates)
      if (!(await db.attendance.get([session.id, row.studentToken]))) await db.attendance.add(row);
    await db.sessions.update(session.id, { state: 'CLOSED' });
    await db.scanEvents.add({ id: eventId, sessionId: session.id, encrypted: event });
  });
}
