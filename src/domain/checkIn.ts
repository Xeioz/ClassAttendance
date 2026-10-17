import Dexie from 'dexie';
import { db } from '../db/db';
import { decrypt, encrypt } from '../db/crypto';
import { assertActiveVault, makeAudit, validateReason } from './audit';
import { parseQR, punctuality } from './qr';
import type { AttendancePrivate, ScanResult, SessionPrivate, Student, VaultKeys } from '../types';

export async function recordAttendance(
  keys: VaultKeys,
  sessionId: string,
  input:
    | { raw: string }
    | { student: Student; reason: string; status?: 'PRESENT' | 'LATE' | 'EXCUSED' },
  now = Date.now(),
): Promise<ScanResult> {
  const stored = await db.sessions.get(sessionId);
  if (!stored || stored.state !== 'ACTIVE')
    throw new Error('This session is closed or unavailable.');
  const session = await decrypt<SessionPrivate>(
    keys.encryption,
    stored.encrypted,
    `session:${sessionId}`,
  );
  const id = 'raw' in input ? parseQR(input.raw, session.roomPin, now).id : input.student.id;
  const student = session.roster.find((row) => row.id === id);
  if ('student' in input) {
    validateReason(input.reason);
    if (!student || input.student.token !== student.token)
      throw new Error('Choose an enrolled student.');
    if (input.status !== undefined && !['PRESENT', 'LATE', 'EXCUSED'].includes(input.status))
      throw new Error('Invalid manual check-in status.');
  }
  const entry: AttendancePrivate = {
    status:
      'status' in input && input.status
        ? input.status
        : punctuality(now, session.startsAt, session.graceMinutes),
    at: now,
    originalAt: now,
    source: 'raw' in input ? 'QR' : 'MANUAL',
    ...('reason' in input ? { reason: input.reason.trim() } : {}),
  };
  const encrypted = student
    ? await encrypt(keys.encryption, entry, `attendance:${sessionId}:${student.token}`)
    : undefined;
  const result = await db.transaction(
    'rw',
    [db.sessions, db.attendance, db.scanEvents, db.meta],
    async () => {
      await assertActiveVault(keys, sessionId);
      if (
        JSON.stringify((await db.sessions.get(sessionId))?.encrypted) !==
        JSON.stringify(stored.encrypted)
      )
        throw new Error('The session changed. Refresh and retry.');
      const existing = student ? await db.attendance.get([sessionId, student.token]) : undefined;
      const prior = existing
        ? await Dexie.waitFor(
            decrypt<AttendancePrivate>(
              keys.encryption,
              existing.encrypted,
              `attendance:${sessionId}:${student!.token}`,
            ),
          )
        : undefined;
      const kind = !student ? 'unknown' : prior ? 'duplicate' : 'valid';
      // Keep crypto promises alive inside the IndexedDB transaction and commit audit + attendance together.
      const audit = await Dexie.waitFor(
        makeAudit(keys, sessionId, {
          action:
            kind === 'unknown'
              ? 'UNLISTED_SCAN'
              : kind === 'duplicate'
                ? 'DUPLICATE_SCAN'
                : entry.source === 'QR'
                  ? 'SCAN_LOGGED'
                  : 'MANUAL_ENTRY',
          at: now,
          performedBy: 'TEACHER_PIN',
          studentToken: student?.token,
          studentId: id,
          previousStatus: prior?.status,
          newStatus: prior?.status ?? (student ? entry.status : undefined),
          firstAt: prior?.originalAt ?? prior?.at,
          secondAt: prior ? now : undefined,
          reason: entry.reason,
        }),
      );
      await db.scanEvents.add(audit);
      if (kind === 'valid' && student && encrypted)
        await db.attendance.add({ sessionId, studentToken: student.token, encrypted });
      return { kind, prior } as const;
    },
  );
  if (result.kind === 'unknown')
    return {
      kind: 'unknown',
      title: 'Not in this roster',
      detail: `${id} · Enrollment has not been changed.`,
    };
  if (result.kind === 'duplicate')
    return {
      kind: 'duplicate',
      title: 'Already recorded',
      detail: `${student!.name} · ${result.prior!.status} · ${new Date(result.prior!.originalAt ?? result.prior!.at).toLocaleTimeString()}`,
      studentToken: student!.token,
      firstAt: result.prior!.originalAt ?? result.prior!.at,
      secondAt: now,
    };
  return {
    kind: 'valid',
    title: `${entry.status === 'EXCUSED' ? 'Excused' : entry.status === 'LATE' ? 'Late' : 'Present'} · Saved`,
    detail: `${student!.name} · ${student!.id} · ${new Date(now).toLocaleTimeString()}`,
    studentToken: student!.token,
  };
}

export async function correctAttendance(
  keys: VaultKeys,
  sessionId: string,
  student: Student,
  status: AttendancePrivate['status'],
  reason: string,
): Promise<void> {
  validateReason(reason);
  if (!['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].includes(status))
    throw new Error('Invalid attendance status.');
  const session = await db.sessions.get(sessionId);
  if (!session || session.state !== 'ACTIVE')
    throw new Error('Reopen the session before changing its records.');
  if (
    !(
      await decrypt<SessionPrivate>(keys.encryption, session.encrypted, `session:${sessionId}`)
    ).roster.some((row) => row.token === student.token)
  )
    throw new Error('Student does not belong to this session.');
  const priorRow = await db.attendance.get([sessionId, student.token]);
  const prior = priorRow
    ? await decrypt<AttendancePrivate>(
        keys.encryption,
        priorRow.encrypted,
        `attendance:${sessionId}:${student.token}`,
      )
    : undefined;
  const at = Date.now();
  const record = await encrypt(
    keys.encryption,
    {
      status,
      at,
      originalAt: prior?.originalAt ?? (prior && prior.source !== 'SYSTEM' ? prior.at : undefined),
      source: 'MANUAL',
      reason: reason.trim(),
    },
    `attendance:${sessionId}:${student.token}`,
  );
  const event = await makeAudit(keys, sessionId, {
    action: prior ? 'STATUS_CHANGE' : 'MANUAL_ENTRY',
    at,
    performedBy: 'TEACHER_PIN',
    studentToken: student.token,
    studentId: student.id,
    previousStatus: prior?.status,
    newStatus: status,
    firstAt: prior?.originalAt ?? prior?.at,
    reason: reason.trim(),
  });
  await db.transaction('rw', [db.attendance, db.scanEvents, db.sessions, db.meta], async () => {
    await assertActiveVault(keys, sessionId);
    if (
      JSON.stringify(await db.attendance.get([sessionId, student.token])) !==
      JSON.stringify(priorRow)
    )
      throw new Error('Attendance changed. Refresh and retry.');
    await db.attendance.put({ sessionId, studentToken: student.token, encrypted: record });
    await db.scanEvents.add(event);
  });
}
