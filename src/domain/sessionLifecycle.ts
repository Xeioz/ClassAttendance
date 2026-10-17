import { db } from '../db/db';
import { decrypt, encrypt } from '../db/crypto';
import {
  assertActiveVault,
  makeAudit,
  readAudit,
  unresolvedDisputes,
  validateReason,
} from './audit';
import type { AttendancePrivate, Session, SessionPrivate, VaultKeys } from '../types';

export async function closeSession(keys: VaultKeys, supplied: Session): Promise<void> {
  const stored = await db.sessions.get(supplied.id);
  if (!stored || stored.state !== 'ACTIVE') throw new Error('Session is already closed.');
  const session = await decrypt<SessionPrivate>(
    keys.encryption,
    stored.encrypted,
    `session:${stored.id}`,
  );
  const history = await readAudit(keys, stored.id);
  if (unresolvedDisputes(history).length)
    throw new Error('Resolve pending disputes before closing the session.');
  const at = Date.now();
  const candidates = await Promise.all(
    session.roster.map(async (student) => ({
      sessionId: stored.id,
      studentToken: student.token,
      encrypted: await encrypt(
        keys.encryption,
        { status: 'ABSENT', at, source: 'SYSTEM', reason: 'Not recorded at session closure' },
        `attendance:${stored.id}:${student.token}`,
      ),
    })),
  );
  const encrypted = await encrypt(
    keys.encryption,
    { ...session, closedAt: at },
    `session:${stored.id}`,
  );
  const event = await makeAudit(keys, stored.id, {
    action: 'SESSION_CLOSED',
    at,
    performedBy: 'TEACHER_PIN',
  });
  await db.transaction('rw', [db.sessions, db.attendance, db.scanEvents, db.meta], async () => {
    await assertActiveVault(keys, stored.id);
    if ((await db.scanEvents.where('sessionId').equals(stored.id).count()) !== history.length)
      throw new Error('Session activity changed. Review and close again.');
    for (const row of candidates)
      if (!(await db.attendance.get([stored.id, row.studentToken]))) await db.attendance.add(row);
    await db.sessions.update(stored.id, { state: 'CLOSED', encrypted });
    await db.scanEvents.add(event);
  });
}

export async function reopenSession(
  keys: VaultKeys,
  sessionId: string,
  reason: string,
): Promise<void> {
  validateReason(reason);
  const stored = await db.sessions.get(sessionId);
  if (!stored || stored.state !== 'CLOSED')
    throw new Error('Only a closed session can be reopened.');
  const session = await decrypt<SessionPrivate>(
    keys.encryption,
    stored.encrypted,
    `session:${sessionId}`,
  );
  const rows = await db.attendance.where('sessionId').equals(sessionId).toArray();
  const automatic: string[] = [];
  for (const row of rows) {
    const entry = await decrypt<AttendancePrivate>(
      keys.encryption,
      row.encrypted,
      `attendance:${sessionId}:${row.studentToken}`,
    );
    // Legacy closure rows used MANUAL with this exact reason. Explicit teacher absences stay intact.
    if (
      entry.status === 'ABSENT' &&
      (entry.source === 'SYSTEM' ||
        (entry.source === 'MANUAL' && entry.reason === 'Not recorded at session closure'))
    )
      automatic.push(row.studentToken);
  }
  const { closedAt: _closedAt, ...active } = session;
  const encrypted = await encrypt(keys.encryption, active, `session:${sessionId}`);
  const event = await makeAudit(keys, sessionId, {
    action: 'SESSION_REOPENED',
    at: Date.now(),
    performedBy: 'TEACHER_PIN',
    reason: `${reason.trim()} (${automatic.length} automatic absences returned to not yet recorded)`,
  });
  await db.transaction('rw', [db.meta, db.sessions, db.attendance, db.scanEvents], async () => {
    if ((await db.meta.get('vault'))?.salt !== keys.salt)
      throw new Error('Vault changed. Unlock again.');
    if (JSON.stringify(await db.sessions.get(sessionId)) !== JSON.stringify(stored))
      throw new Error('Session changed. Refresh and retry.');
    if (await db.sessions.where('state').equals('ACTIVE').count())
      throw new Error('Close the other active session before reopening this one.');
    if (
      JSON.stringify(await db.attendance.where('sessionId').equals(sessionId).toArray()) !==
      JSON.stringify(rows)
    )
      throw new Error('Attendance changed. Refresh and retry.');
    for (const token of automatic) await db.attendance.delete([sessionId, token]);
    await db.sessions.update(sessionId, { state: 'ACTIVE', encrypted });
    await db.scanEvents.add(event);
  });
}
