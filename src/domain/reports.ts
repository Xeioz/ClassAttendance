import { db } from '../db/db';
import { decrypt } from '../db/crypto';
import { readAuditRows } from './audit';
import type { AttendancePrivate, Session, SessionPrivate, VaultKeys } from '../types';

export function attendanceSummary(session: Session, attendance: Map<string, AttendancePrivate>) {
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, PENDING: 0 };
  for (const student of session.roster)
    counts[attendance.get(student.token)?.status ?? 'PENDING']++;
  const total = session.roster.length;
  return { counts, total, rate: total ? (counts.PRESENT + counts.LATE) / total : 0 };
}
export function sessionDate(session: Session): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: session.timezone ?? 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(session.startsAt));
}
export function reportFilename(session: Session, extension: 'xlsx' | 'csv'): string {
  const safe = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${safe(session.course)}_${safe(session.section)}_Attendance_${sessionDate(session)}_${safe(session.id)}.${extension}`;
}
export function recordedTime(entry?: AttendancePrivate): string {
  return !entry || entry.status === 'ABSENT'
    ? ''
    : new Date(entry.originalAt ?? entry.at).toISOString();
}
export async function readReportSnapshot(keys: VaultKeys, sessionId: string) {
  const raw = await db.transaction(
    'r',
    [db.meta, db.sessions, db.attendance, db.scanEvents],
    async () => {
      if ((await db.meta.get('vault'))?.salt !== keys.salt)
        throw new Error('Vault changed. Unlock again.');
      const session = await db.sessions.get(sessionId);
      if (!session) throw new Error('Session unavailable.');
      return {
        session,
        attendance: await db.attendance.where('sessionId').equals(sessionId).toArray(),
        events: await db.scanEvents.where('sessionId').equals(sessionId).toArray(),
      };
    },
  );
  const session: Session = {
    ...(await decrypt<SessionPrivate>(
      keys.encryption,
      raw.session.encrypted,
      `session:${sessionId}`,
    )),
    id: sessionId,
    state: raw.session.state,
  };
  const attendance = new Map(
    await Promise.all(
      raw.attendance.map(
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
  return { session, attendance, audit: await readAuditRows(keys, raw.events) };
}
