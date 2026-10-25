import { teacherOperation } from './operations';
import { db } from '../db/db';
import { decrypt, encrypt } from '../db/crypto';
import type {
  AttendancePrivate,
  AuditEntry,
  AuditPayload,
  Cipher,
  EventRow,
  SessionPrivate,
  VaultKeys,
} from '../types';

export async function makeAudit(
  keys: VaultKeys,
  sessionId: string,
  payload: AuditPayload,
): Promise<EventRow> {
  const id = crypto.randomUUID();
  return { id, sessionId, encrypted: await encrypt(keys.encryption, payload, `event:${id}`) };
}

export async function readAudit(keys: VaultKeys, sessionId: string): Promise<AuditEntry[]> {
  const rows = await db.scanEvents.where('sessionId').equals(sessionId).toArray();
  return readAuditRows(keys, rows);
}
export async function readAuditRows(keys: VaultKeys, rows: EventRow[]): Promise<AuditEntry[]> {
  const events = await Promise.all(
    rows.map(async (row) => {
      const sessionId = row.sessionId;
      const data = await decrypt<Record<string, unknown>>(
        keys.encryption,
        row.encrypted,
        `event:${row.id}`,
      );
      // Preserve v1 history; an old generic attempt cannot be reconstructed as a verified success.
      const action =
        typeof data.action === 'string'
          ? data.action
          : data.source === 'CORRECTION'
            ? 'STATUS_CHANGE'
            : data.source === 'SESSION_CLOSED'
              ? 'SESSION_CLOSED'
              : data.outcome === 'UNLISTED'
                ? 'UNLISTED_SCAN'
                : 'LEGACY_SCAN_ATTEMPT';
      let previousStatus = data.previousStatus as AttendancePrivate['status'] | undefined;
      if (data.before && typeof data.studentToken === 'string')
        previousStatus = (
          await decrypt<AttendancePrivate>(
            keys.encryption,
            data.before as Cipher,
            `attendance:${sessionId}:${data.studentToken}`,
          )
        ).status;
      return {
        ...data,
        action,
        eventId: row.id,
        sessionId,
        at: typeof data.at === 'number' ? data.at : 0,
        performedBy: data.performedBy === 'SYSTEM' ? 'SYSTEM' : 'TEACHER_PIN',
        studentId:
          typeof data.studentId === 'string'
            ? data.studentId
            : typeof data.id === 'string'
              ? data.id
              : undefined,
        previousStatus,
        newStatus: (data.newStatus ?? data.status) as AttendancePrivate['status'] | undefined,
      } as AuditEntry;
    }),
  );
  return events.sort((a, b) => a.at - b.at || a.eventId.localeCompare(b.eventId));
}

export function unresolvedDisputes(events: AuditEntry[]): AuditEntry[] {
  const resolved = new Set(
    events.filter((event) => event.action === 'DISPUTE_RESOLVED').map((event) => event.disputeId),
  );
  return events.filter(
    (event) => event.action === 'DISPUTE_FLAGGED' && !resolved.has(event.eventId),
  );
}

async function flagDisputeInternal(
  keys: VaultKeys,
  sessionId: string,
  studentToken: string,
  reason: string,
  secondAt = Date.now(),
): Promise<void> {
  validateReason(reason);
  const session = await db.sessions.get(sessionId);
  const record = await db.attendance.get([sessionId, studentToken]);
  if (!session || session.state !== 'ACTIVE' || !record)
    throw new Error('Reopen the session and choose a recorded student before flagging a dispute.');
  const data = await decrypt<SessionPrivate>(
    keys.encryption,
    session.encrypted,
    `session:${sessionId}`,
  );
  const student = data.roster.find((row) => row.token === studentToken);
  if (!student) throw new Error('Student is not in the session roster.');
  const prior = await decrypt<AttendancePrivate>(
    keys.encryption,
    record.encrypted,
    `attendance:${sessionId}:${studentToken}`,
  );
  const history = await readAudit(keys, sessionId);
  if (unresolvedDisputes(history).some((event) => event.studentToken === studentToken))
    throw new Error('This student already has an unresolved dispute.');
  if (!Number.isFinite(secondAt)) throw new Error('Invalid second presentation time.');
  const event = await makeAudit(keys, sessionId, {
    action: 'DISPUTE_FLAGGED',
    at: Date.now(),
    performedBy: 'TEACHER_PIN',
    studentToken,
    studentId: student.id,
    firstAt: prior.originalAt ?? prior.at,
    secondAt,
    reason: reason.trim(),
  });
  await db.transaction('rw', [db.meta, db.sessions, db.attendance, db.scanEvents], async () => {
    await assertActiveVault(keys, sessionId);
    if (
      (await db.scanEvents.where('sessionId').equals(sessionId).count()) !== history.length ||
      JSON.stringify(await db.attendance.get([sessionId, studentToken])) !== JSON.stringify(record)
    )
      throw new Error('Session activity changed. Refresh and retry.');
    await db.scanEvents.add(event);
  });
}

async function resolveDisputeInternal(
  keys: VaultKeys,
  sessionId: string,
  disputeId: string,
  reason: string,
): Promise<void> {
  validateReason(reason);
  const history = await readAudit(keys, sessionId);
  const pending = unresolvedDisputes(history).find((event) => event.eventId === disputeId);
  if (!pending) throw new Error('Dispute is already resolved or unavailable.');
  const event = await makeAudit(keys, sessionId, {
    action: 'DISPUTE_RESOLVED',
    at: Date.now(),
    performedBy: 'TEACHER_PIN',
    disputeId,
    studentToken: pending.studentToken,
    studentId: pending.studentId,
    firstAt: pending.firstAt,
    secondAt: pending.secondAt,
    reason: reason.trim(),
  });
  await db.transaction('rw', [db.meta, db.sessions, db.scanEvents], async () => {
    await assertActiveVault(keys, sessionId);
    if ((await db.scanEvents.where('sessionId').equals(sessionId).count()) !== history.length)
      throw new Error('Session activity changed. Refresh and retry.');
    await db.scanEvents.add(event);
  });
}
export function validateReason(reason: string): void {
  if (reason.trim().length < 3 || reason.length > 500)
    throw new Error('Enter a reason between 3 and 500 characters.');
}
export async function assertActiveVault(keys: VaultKeys, sessionId: string): Promise<void> {
  if ((await db.meta.get('vault'))?.salt !== keys.salt)
    throw new Error('The vault changed. Lock and unlock again.');
  if ((await db.sessions.get(sessionId))?.state !== 'ACTIVE')
    throw new Error('Reopen the session before changing its records.');
}

export const flagDispute = teacherOperation(flagDisputeInternal);

export const resolveDispute = teacherOperation(resolveDisputeInternal);
