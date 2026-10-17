import { db } from './db';
import { decrypt, deriveKeys, encrypt, ITERATIONS } from './crypto';
import { downloadFile } from '../utils/download';
import type {
  AttendancePrivate,
  AttendanceRow,
  Cipher,
  EventRow,
  SessionPrivate,
  SessionRow,
  StudentPrivate,
  StudentRow,
  VaultKeys,
  VaultMeta,
} from '../types';

interface BackupData {
  students: StudentRow[];
  sessions: SessionRow[];
  attendance: AttendanceRow[];
  scanEvents: EventRow[];
}
interface BackupFile {
  format: 'attendance-desk';
  v: 1;
  meta: VaultMeta;
  payload: Cipher;
}

export async function exportBackup(keys: VaultKeys): Promise<void> {
  const snapshot = await db.transaction(
    'r',
    [db.meta, db.students, db.sessions, db.attendance, db.scanEvents],
    async () => ({
      meta: await db.meta.get('vault'),
      students: await db.students.toArray(),
      sessions: await db.sessions.toArray(),
      attendance: await db.attendance.toArray(),
      scanEvents: await db.scanEvents.toArray(),
    }),
  );
  if (!snapshot.meta) throw new Error('No vault to back up.');
  if (snapshot.meta.salt !== keys.salt)
    throw new Error('The vault changed in another tab. Lock and unlock again.');
  const { meta, ...data } = snapshot;
  const file: BackupFile = {
    format: 'attendance-desk',
    v: 1,
    meta,
    payload: await encrypt(keys.encryption, data, 'backup:v1'),
  };
  downloadFile(
    new Blob([JSON.stringify(file)], { type: 'application/json' }),
    `attendance_backup_${new Date().toISOString().slice(0, 10)}.enc.json`,
  );
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isCipher(value: unknown): value is Cipher {
  return (
    isObject(value) &&
    value.v === 1 &&
    typeof value.iv === 'string' &&
    value.iv.length === 16 &&
    typeof value.data === 'string'
  );
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 512;
}

export async function restoreBackup(
  file: File,
  pin: string,
): Promise<{ students: number; sessions: number; courses: number }> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Backup exceeds the 25 MB restore limit.');
  const raw: unknown = JSON.parse(await file.text());
  if (
    !isObject(raw) ||
    raw.format !== 'attendance-desk' ||
    raw.v !== 1 ||
    !isObject(raw.meta) ||
    !isCipher(raw.payload)
  )
    throw new Error('Unsupported backup format.');
  const meta = raw.meta;
  if (
    meta.id !== 'vault' ||
    meta.v !== 1 ||
    meta.iterations !== ITERATIONS ||
    typeof meta.salt !== 'string' ||
    meta.salt.length !== 24 ||
    !isCipher(meta.verifier)
  )
    throw new Error('Invalid backup key metadata.');
  const keys = await deriveKeys(pin, meta.salt);
  if ((await decrypt<string>(keys.encryption, meta.verifier, 'vault:v1')) !== 'attendance-desk')
    throw new Error('Wrong backup PIN.');
  const data = await decrypt<BackupData>(keys.encryption, raw.payload, 'backup:v1');
  for (const name of ['students', 'sessions', 'attendance', 'scanEvents'] as const)
    if (!Array.isArray(data[name]) || data[name].length > 100000)
      throw new Error('Invalid backup table.');
  const sessions = new Set<string>();
  const courses = new Set<string>();
  const sessionStudents = new Map<string, Set<string>>();
  for (const row of data.students) {
    if (
      !isObject(row) ||
      !string(row.token) ||
      !string(row.sectionToken) ||
      !isCipher(row.encrypted)
    )
      throw new Error('Invalid student record.');
    const student = await decrypt<StudentPrivate>(
      keys.encryption,
      row.encrypted,
      `student:${row.token}`,
    );
    if (!string(student.id) || !string(student.name) || !string(student.section))
      throw new Error('Invalid student data.');
  }
  for (const row of data.sessions) {
    if (
      !isObject(row) ||
      !string(row.id) ||
      !['ACTIVE', 'CLOSED'].includes(row.state) ||
      !isCipher(row.encrypted)
    )
      throw new Error('Invalid session record.');
    const session = await decrypt<SessionPrivate>(
      keys.encryption,
      row.encrypted,
      `session:${row.id}`,
    );
    if (
      !string(session.course) ||
      !string(session.section) ||
      !Array.isArray(session.roster) ||
      !Number.isFinite(session.startsAt)
    )
      throw new Error('Invalid session data.');
    if (
      !/^\d{3,6}$/.test(session.roomPin) ||
      !Number.isInteger(session.graceMinutes) ||
      session.graceMinutes < 0 ||
      session.graceMinutes > 180 ||
      session.roster.length > 10000
    )
      throw new Error('Invalid session settings.');
    const tokens = new Set<string>();
    for (const student of session.roster) {
      if (
        !isObject(student) ||
        !string(student.id) ||
        !string(student.name) ||
        !string(student.section) ||
        !string(student.token) ||
        tokens.has(student.token)
      )
        throw new Error('Invalid session roster snapshot.');
      tokens.add(student.token);
    }
    if (session.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: session.timezone }).format(session.startsAt);
      } catch {
        throw new Error('Invalid session timezone.');
      }
    }
    sessionStudents.set(row.id, tokens);
    sessions.add(row.id);
    courses.add(session.course);
  }
  if (data.sessions.filter((row) => row.state === 'ACTIVE').length > 1)
    throw new Error('Backup has conflicting active sessions.');
  for (const row of data.attendance) {
    if (
      !isObject(row) ||
      !string(row.studentToken) ||
      !sessions.has(row.sessionId) ||
      !sessionStudents.get(row.sessionId)?.has(row.studentToken) ||
      !isCipher(row.encrypted)
    )
      throw new Error('Invalid attendance record.');
    const entry = await decrypt<AttendancePrivate>(
      keys.encryption,
      row.encrypted,
      `attendance:${row.sessionId}:${row.studentToken}`,
    );
    if (
      !['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].includes(entry.status) ||
      !Number.isFinite(entry.at) ||
      !['QR', 'MANUAL', 'SYSTEM'].includes(entry.source) ||
      (entry.originalAt !== undefined && !Number.isFinite(entry.originalAt))
    )
      throw new Error('Invalid attendance data.');
  }
  for (const row of data.scanEvents) {
    if (
      !isObject(row) ||
      !string(row.id) ||
      !sessions.has(row.sessionId) ||
      !isCipher(row.encrypted)
    )
      throw new Error('Invalid event record.');
    await decrypt(keys.encryption, row.encrypted, `event:${row.id}`);
  }
  // Validation and decryption finish before touching existing data. Any failure rolls back replacement.
  await db.transaction(
    'rw',
    [db.meta, db.students, db.sessions, db.attendance, db.scanEvents],
    async () => {
      await Promise.all([
        db.meta.clear(),
        db.students.clear(),
        db.sessions.clear(),
        db.attendance.clear(),
        db.scanEvents.clear(),
      ]);
      await db.meta.add(meta as unknown as VaultMeta);
      await db.students.bulkAdd(data.students);
      await db.sessions.bulkAdd(data.sessions);
      await db.attendance.bulkAdd(data.attendance);
      await db.scanEvents.bulkAdd(data.scanEvents);
    },
  );
  return { students: data.students.length, sessions: data.sessions.length, courses: courses.size };
}
