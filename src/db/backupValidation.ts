import { decrypt, ITERATIONS, privateToken } from './crypto';
import { normalizeId, sectionKey } from '../utils/normalize';
import type {
  AttendancePrivate,
  AttendanceRow,
  Cipher,
  EventRow,
  SessionPrivate,
  SessionRow,
  Student,
  StudentPrivate,
  StudentRow,
  VaultKeys,
  VaultMeta,
} from '../types';

export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;
export const BACKUP_TABLE_LIMIT = 100_000;
export const BACKUP_ROSTER_LIMIT = 10_000;
export interface BackupData {
  students: StudentRow[];
  sessions: SessionRow[];
  attendance: AttendanceRow[];
  scanEvents: EventRow[];
}
const statuses = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
const actions = [
  'SCAN_LOGGED',
  'MANUAL_ENTRY',
  'DUPLICATE_SCAN',
  'UNLISTED_SCAN',
  'STATUS_CHANGE',
  'DISPUTE_FLAGGED',
  'DISPUTE_RESOLVED',
  'SESSION_CLOSED',
  'SESSION_REOPENED',
  'LEGACY_SCAN_ATTEMPT',
] as const;
const actionFields: Record<(typeof actions)[number], string[]> = {
  SCAN_LOGGED: ['studentToken', 'studentId', 'newStatus'],
  UNLISTED_SCAN: ['studentId'],
  MANUAL_ENTRY: ['studentToken', 'studentId', 'newStatus', 'reason'],
  DUPLICATE_SCAN: [
    'studentToken',
    'studentId',
    'previousStatus',
    'newStatus',
    'firstAt',
    'secondAt',
    'reason',
  ],
  STATUS_CHANGE: ['studentToken', 'studentId', 'previousStatus', 'newStatus', 'firstAt', 'reason'],
  DISPUTE_FLAGGED: ['studentToken', 'studentId', 'firstAt', 'secondAt', 'reason'],
  DISPUTE_RESOLVED: ['studentToken', 'studentId', 'firstAt', 'secondAt', 'reason', 'disputeId'],
  SESSION_CLOSED: [],
  SESSION_REOPENED: ['reason'],
  LEGACY_SCAN_ATTEMPT: ['studentId'],
};
type ObjectValue = Record<string, unknown>;
function invalid(path: string, message: string): never {
  // Paths contain table names/indices, never private record contents or identifiers.
  throw new Error(`Invalid backup ${path}: ${message}.`);
}
function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(path, 'expected an object');
  return value as ObjectValue;
}
function text(value: unknown, path: string, max = 511, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()))
    invalid(path, `expected ${allowEmpty ? 'text' : 'nonempty text'} of at most ${max} characters`);
  return value;
}
function optionalText(value: unknown, path: string, max: number): string | undefined {
  return value === undefined ? undefined : text(value, path, max, true);
}
function choice<const T extends readonly string[]>(
  value: unknown,
  path: string,
  values: T,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) invalid(path, 'unsupported value');
  return value as T[number];
}
function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 8.64e15)
    invalid(path, 'expected a valid millisecond timestamp');
  return value;
}
function optionalTimestamp(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : timestamp(value, path);
}
function base64(value: unknown, path: string, bytes?: number): string {
  if (typeof value !== 'string' || value.length % 4) invalid(path, 'expected base64 data');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  // Avoid a repeated-group regex: large, valid backups can exhaust its backtracking stack.
  if (/[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding)))
    invalid(path, 'expected base64 data');
  const length = (value.length / 4) * 3 - padding;
  if (bytes !== undefined ? length !== bytes : length < 16) invalid(path, 'invalid encoded length');
  return value;
}
export function validateCipher(value: unknown, path: string): Cipher {
  const raw = object(value, path);
  if (raw.v !== 1) invalid(`${path}.v`, 'unsupported cipher version');
  return { v: 1, iv: base64(raw.iv, `${path}.iv`, 12), data: base64(raw.data, `${path}.data`) };
}
export function validateVaultMeta(value: unknown): VaultMeta {
  const raw = object(value, 'meta');
  if (raw.id !== 'vault' || raw.v !== 1 || raw.iterations !== ITERATIONS)
    invalid('meta', 'unsupported key metadata');
  return {
    id: 'vault',
    v: 1,
    iterations: ITERATIONS,
    salt: base64(raw.salt, 'meta.salt', 16),
    verifier: validateCipher(raw.verifier, 'meta.verifier'),
  };
}
export function validateBackupSize(bytes: number): void {
  if (bytes > BACKUP_MAX_BYTES) throw new Error('Backup exceeds the 25 MB restore limit.');
}
function canonicalId(value: unknown, path: string): string {
  const id = text(value, path, 64);
  try {
    if (normalizeId(id) === id) return id;
  } catch {
    /* sanitized error below */
  }
  return invalid(path, 'expected a canonical student ID');
}
function student(value: unknown, path: string): StudentPrivate {
  const raw = object(value, path);
  const id = canonicalId(raw.id, `${path}.id`),
    section = text(raw.section, `${path}.section`, 100);
  if (sectionKey(section) !== section) invalid(`${path}.section`, 'expected a canonical section');
  const displayId = optionalText(raw.displayId, `${path}.displayId`, 64);
  if (displayId !== undefined) {
    try {
      if (normalizeId(displayId) !== id)
        invalid(`${path}.displayId`, 'ID representations disagree');
    } catch {
      invalid(`${path}.displayId`, 'ID representations disagree');
    }
  }
  return {
    id,
    section,
    name: text(raw.name, `${path}.name`, 200),
    ...(displayId !== undefined ? { displayId } : {}),
  };
}
function attendance(value: unknown, path: string): AttendancePrivate {
  const raw = object(value, path);
  return {
    status: choice(raw.status, `${path}.status`, statuses),
    source: choice(raw.source, `${path}.source`, ['QR', 'MANUAL', 'SYSTEM']),
    at: timestamp(raw.at, `${path}.at`),
    reason: optionalText(raw.reason, `${path}.reason`, 500),
    originalAt: optionalTimestamp(raw.originalAt, `${path}.originalAt`),
  };
}
async function decoded(
  keys: VaultKeys,
  cipher: Cipher,
  context: string,
  path: string,
): Promise<unknown> {
  try {
    return await decrypt<unknown>(keys.encryption, cipher, context);
  } catch {
    return invalid(path, 'could not authenticate or decode encrypted data');
  }
}
function unique(seen: Set<string>, value: string, path: string): void {
  if (seen.has(value)) invalid(path, 'duplicate record');
  seen.add(value);
}
const eventFields = [
  'action',
  'at',
  'performedBy',
  'studentToken',
  'studentId',
  'previousStatus',
  'newStatus',
  'reason',
  'firstAt',
  'secondAt',
  'disputeId',
  'before',
  'id',
  'source',
  'outcome',
  'status',
];
function eventShape(payload: ObjectValue, allowed: string[], path: string): void {
  for (const field of eventFields)
    if (payload[field] !== undefined && !allowed.includes(field))
      invalid(`${path}.${field}`, 'field is not supported in this event format');
}
interface CheckedSession {
  row: SessionRow;
  data: SessionPrivate;
  roster: Map<string, Student>;
  ids: Set<string>;
}
interface CheckedEvent {
  row: EventRow;
  path: string;
  action: string;
  studentToken?: string;
  firstAt?: number;
  secondAt?: number;
  disputeId?: string;
}

/** Validate every consumed field before either offering a backup or replacing a workspace. */
export async function validateBackupData(
  value: unknown,
  keys: VaultKeys,
): Promise<{ data: BackupData; courses: number }> {
  const raw = object(value, 'payload');
  const tables: Record<keyof BackupData, unknown[]> = {
    students: [],
    sessions: [],
    attendance: [],
    scanEvents: [],
  };
  for (const name of Object.keys(tables) as (keyof BackupData)[]) {
    const table = raw[name];
    if (!Array.isArray(table) || table.length > BACKUP_TABLE_LIMIT)
      invalid(
        name,
        `expected an array with at most ${BACKUP_TABLE_LIMIT.toLocaleString('en-US')} records`,
      );
    tables[name] = table;
  }
  const data: BackupData = { students: [], sessions: [], attendance: [], scanEvents: [] };
  // Historical snapshots may differ from today's roster. Cache repeated HMAC checks.
  const tokenCache = new Map<string, Promise<string>>();
  const tokenFor = (context: string) => {
    let token = tokenCache.get(context);
    if (!token) {
      token = privateToken(keys, context);
      tokenCache.set(context, token);
    }
    return token;
  };
  const checkIdentity = async (token: string, record: StudentPrivate, path: string) => {
    if ((await tokenFor(`student:${record.section}:${record.id}`)) !== token)
      invalid(path, 'student token does not match its identity');
  };
  const studentTokens = new Set<string>();
  for (const [index, value] of tables.students.entries()) {
    const path = `students[${index}]`,
      raw = object(value, path);
    const row: StudentRow = {
      token: text(raw.token, `${path}.token`),
      sectionToken: text(raw.sectionToken, `${path}.sectionToken`),
      encrypted: validateCipher(raw.encrypted, `${path}.encrypted`),
    };
    unique(studentTokens, row.token, path);
    const payload = object(
      await decoded(keys, row.encrypted, `student:${row.token}`, `${path}.encrypted`),
      path,
    );
    // listStudents spreads private fields after the outer token. A private token must
    // never override the authenticated row identity (roster snapshots have their own token).
    if (payload.token !== undefined)
      invalid(`${path}.token`, 'unexpected token inside private student data');
    const record = student(payload, path);
    await checkIdentity(row.token, record, `${path}.token`);
    if ((await tokenFor(`section:${record.section}`)) !== row.sectionToken)
      invalid(`${path}.sectionToken`, 'section token does not match its section');
    data.students.push(row);
  }
  const sessions = new Map<string, CheckedSession>(),
    courses = new Set<string>();
  let activeSessions = 0;
  for (const [index, value] of tables.sessions.entries()) {
    const path = `sessions[${index}]`,
      raw = object(value, path);
    const row: SessionRow = {
      id: text(raw.id, `${path}.id`),
      state: choice(raw.state, `${path}.state`, ['ACTIVE', 'CLOSED']),
      encrypted: validateCipher(raw.encrypted, `${path}.encrypted`),
    };
    if (sessions.has(row.id)) invalid(path, 'duplicate record');
    if (row.state === 'ACTIVE' && ++activeSessions > 1)
      invalid('sessions', 'conflicting active sessions');
    const record = object(
      await decoded(keys, row.encrypted, `session:${row.id}`, `${path}.encrypted`),
      path,
    );
    const section = text(record.section, `${path}.section`, 100),
      roomPin = text(record.roomPin, `${path}.roomPin`, 6);
    if (sectionKey(section) !== section) invalid(`${path}.section`, 'expected a canonical section');
    if (!/^\d{3,6}$/.test(roomPin)) invalid(`${path}.roomPin`, 'expected a 3–6 digit challenge');
    if (
      typeof record.graceMinutes !== 'number' ||
      !Number.isInteger(record.graceMinutes) ||
      record.graceMinutes < 0 ||
      record.graceMinutes > 180
    )
      invalid(`${path}.graceMinutes`, 'expected an integer from 0 to 180');
    if (
      !Array.isArray(record.roster) ||
      !record.roster.length ||
      record.roster.length > BACKUP_ROSTER_LIMIT
    )
      invalid(
        `${path}.roster`,
        `expected 1–${BACKUP_ROSTER_LIMIT.toLocaleString('en-US')} students`,
      );
    const roster = new Map<string, Student>();
    for (const [studentIndex, value] of record.roster.entries()) {
      const studentPath = `${path}.roster[${studentIndex}]`,
        rawStudent = object(value, studentPath);
      const entry = {
        ...student(rawStudent, studentPath),
        token: text(rawStudent.token, `${studentPath}.token`),
      };
      if (entry.section !== section)
        invalid(`${studentPath}.section`, 'does not match the session section');
      if (roster.has(entry.token)) invalid(studentPath, 'duplicate student');
      await checkIdentity(entry.token, entry, `${studentPath}.token`);
      roster.set(entry.token, entry);
    }
    const timezone = optionalText(record.timezone, `${path}.timezone`, 100);
    if (timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      } catch {
        invalid(`${path}.timezone`, 'unsupported timezone');
      }
    }
    const session: SessionPrivate = {
      course: text(record.course, `${path}.course`, 100),
      section,
      roomPin,
      startsAt: timestamp(record.startsAt, `${path}.startsAt`),
      graceMinutes: record.graceMinutes,
      roster: [...roster.values()],
      timezone,
      institution: optionalText(record.institution, `${path}.institution`, 150),
      subject: optionalText(record.subject, `${path}.subject`, 150),
      room: optionalText(record.room, `${path}.room`, 150),
      closedAt: optionalTimestamp(record.closedAt, `${path}.closedAt`),
    };
    if (row.state === 'ACTIVE' && session.closedAt !== undefined)
      invalid(`${path}.closedAt`, 'active session cannot have a closure timestamp');
    sessions.set(row.id, {
      row,
      data: session,
      roster,
      ids: new Set(session.roster.map((student) => student.id)),
    });
    courses.add(session.course);
    data.sessions.push(row);
  }
  const attendanceKeys = new Set<string>();
  for (const [index, value] of tables.attendance.entries()) {
    const path = `attendance[${index}]`,
      raw = object(value, path);
    const row: AttendanceRow = {
      sessionId: text(raw.sessionId, `${path}.sessionId`),
      studentToken: text(raw.studentToken, `${path}.studentToken`),
      encrypted: validateCipher(raw.encrypted, `${path}.encrypted`),
    };
    unique(attendanceKeys, JSON.stringify([row.sessionId, row.studentToken]), path);
    if (!sessions.get(row.sessionId)?.roster.has(row.studentToken))
      invalid(path, 'unknown session or roster student');
    attendance(
      await decoded(
        keys,
        row.encrypted,
        `attendance:${row.sessionId}:${row.studentToken}`,
        `${path}.encrypted`,
      ),
      path,
    );
    data.attendance.push(row);
  }
  const events = new Map<string, CheckedEvent>();
  for (const [index, value] of tables.scanEvents.entries()) {
    const path = `scanEvents[${index}]`,
      raw = object(value, path);
    const row: EventRow = {
      id: text(raw.id, `${path}.id`),
      sessionId: text(raw.sessionId, `${path}.sessionId`),
      encrypted: validateCipher(raw.encrypted, `${path}.encrypted`),
    };
    if (events.has(row.id)) invalid(path, 'duplicate record');
    const session = sessions.get(row.sessionId);
    if (!session) invalid(`${path}.sessionId`, 'unknown session');
    const payload = object(
      await decoded(keys, row.encrypted, `event:${row.id}`, `${path}.encrypted`),
      path,
    );
    timestamp(payload.at, `${path}.at`);
    // Reopening appends a generated absence-count explanation to a 500-character input.
    const reason = optionalText(payload.reason, `${path}.reason`, 650);
    const firstAt = optionalTimestamp(payload.firstAt, `${path}.firstAt`),
      secondAt = optionalTimestamp(payload.secondAt, `${path}.secondAt`);
    const studentToken =
      payload.studentToken === undefined
        ? undefined
        : text(payload.studentToken, `${path}.studentToken`);
    const studentId =
      payload.studentId === undefined
        ? undefined
        : canonicalId(payload.studentId, `${path}.studentId`);
    const disputeId =
      payload.disputeId === undefined ? undefined : text(payload.disputeId, `${path}.disputeId`);
    if (payload.previousStatus !== undefined)
      choice(payload.previousStatus, `${path}.previousStatus`, statuses);
    if (payload.newStatus !== undefined) choice(payload.newStatus, `${path}.newStatus`, statuses);
    if (payload.performedBy !== undefined)
      choice(payload.performedBy, `${path}.performedBy`, ['TEACHER_PIN', 'SYSTEM']);
    if (studentToken !== undefined && !session.roster.has(studentToken))
      invalid(`${path}.studentToken`, 'unknown roster student');
    if (studentToken && studentId && session.roster.get(studentToken)?.id !== studentId)
      invalid(`${path}.studentId`, 'does not match the referenced student');
    let action: string,
      identity = studentId;
    if (payload.action !== undefined) {
      const currentAction = choice(payload.action, `${path}.action`, actions);
      action = currentAction;
      choice(payload.performedBy, `${path}.performedBy`, ['TEACHER_PIN', 'SYSTEM']);
      // The reader consumes legacy aliases too: reject mixtures rather than let them override validated fields.
      eventShape(payload, ['action', 'at', 'performedBy', ...actionFields[currentAction]], path);
      if (reason !== undefined && action !== 'SESSION_REOPENED')
        text(reason, `${path}.reason`, 500, true);
      if (
        [
          'SCAN_LOGGED',
          'MANUAL_ENTRY',
          'DUPLICATE_SCAN',
          'STATUS_CHANGE',
          'DISPUTE_FLAGGED',
          'DISPUTE_RESOLVED',
        ].includes(action)
      ) {
        if (!studentToken || !studentId) invalid(path, 'event requires a roster student and ID');
      }
      if (['SCAN_LOGGED', 'MANUAL_ENTRY', 'DUPLICATE_SCAN', 'STATUS_CHANGE'].includes(action))
        choice(payload.newStatus, `${path}.newStatus`, statuses);
      if (['DUPLICATE_SCAN', 'STATUS_CHANGE'].includes(action))
        choice(payload.previousStatus, `${path}.previousStatus`, statuses);
      if (action === 'DUPLICATE_SCAN' && payload.previousStatus !== payload.newStatus)
        invalid(`${path}.newStatus`, 'duplicate scan cannot change attendance status');
      if (action === 'SCAN_LOGGED')
        choice(payload.newStatus, `${path}.newStatus`, ['PRESENT', 'LATE']);
      if (['DUPLICATE_SCAN', 'DISPUTE_FLAGGED', 'DISPUTE_RESOLVED'].includes(action)) {
        timestamp(firstAt, `${path}.firstAt`);
        timestamp(secondAt, `${path}.secondAt`);
      }
      if (
        [
          'MANUAL_ENTRY',
          'STATUS_CHANGE',
          'DISPUTE_FLAGGED',
          'DISPUTE_RESOLVED',
          'SESSION_REOPENED',
        ].includes(action)
      )
        text(reason, `${path}.reason`, action === 'SESSION_REOPENED' ? 650 : 500);
      if (action === 'DISPUTE_RESOLVED') text(disputeId, `${path}.disputeId`);
      if (['UNLISTED_SCAN', 'LEGACY_SCAN_ATTEMPT'].includes(action))
        canonicalId(studentId, `${path}.studentId`);
    } else {
      // Explicit support for c8db3f1 v1 history. A generic attempt is not a verified success.
      const source = choice(payload.source, `${path}.source`, [
        'QR',
        'MANUAL',
        'CORRECTION',
        'SESSION_CLOSED',
      ]);
      if (source === 'QR' || source === 'MANUAL') {
        eventShape(payload, ['id', 'at', 'source', 'outcome'], path);
        identity = canonicalId(payload.id, `${path}.id`);
        action =
          choice(payload.outcome, `${path}.outcome`, ['ATTEMPT', 'UNLISTED']) === 'UNLISTED'
            ? 'UNLISTED_SCAN'
            : 'LEGACY_SCAN_ATTEMPT';
      } else if (source === 'CORRECTION') {
        eventShape(payload, ['studentToken', 'before', 'status', 'reason', 'at', 'source'], path);
        action = 'STATUS_CHANGE';
        if (!studentToken) invalid(`${path}.studentToken`, 'correction requires a roster student');
        choice(payload.status, `${path}.status`, statuses);
        text(reason, `${path}.reason`, 500);
        if (payload.before !== null) {
          const before = validateCipher(payload.before, `${path}.before`);
          attendance(
            await decoded(
              keys,
              before,
              `attendance:${row.sessionId}:${studentToken}`,
              `${path}.before`,
            ),
            `${path}.before`,
          );
        }
      } else {
        eventShape(payload, ['source', 'at'], path);
        action = 'SESSION_CLOSED';
      }
      if (payload.id !== undefined) canonicalId(payload.id, `${path}.id`);
      if (payload.status !== undefined) choice(payload.status, `${path}.status`, statuses);
      if (source !== 'CORRECTION' && payload.before !== undefined)
        invalid(`${path}.before`, 'only legacy corrections may contain prior ciphertext');
    }
    // Unknown scans are legitimate. Other identities belong to the historical session roster,
    // which need not match today's master roster.
    if (identity && action !== 'UNLISTED_SCAN' && !session.ids.has(identity))
      invalid(`${path}.studentId`, 'student is absent from the session roster');
    events.set(row.id, { row, path, action, studentToken, firstAt, secondAt, disputeId });
    data.scanEvents.push(row);
  }
  const resolved = new Set<string>();
  for (const event of events.values()) {
    if (event.action !== 'DISPUTE_RESOLVED') continue;
    const target = events.get(event.disputeId!);
    if (
      !target ||
      target.action !== 'DISPUTE_FLAGGED' ||
      target.row.sessionId !== event.row.sessionId ||
      target.studentToken !== event.studentToken ||
      target.firstAt !== event.firstAt ||
      target.secondAt !== event.secondAt
    )
      invalid(`${event.path}.disputeId`, 'does not identify the matching dispute');
    unique(resolved, target.row.id, `${event.path}.disputeId`);
  }
  const pending = new Set<string>();
  for (const event of events.values()) {
    if (event.action !== 'DISPUTE_FLAGGED' || resolved.has(event.row.id)) continue;
    if (sessions.get(event.row.sessionId)?.row.state === 'CLOSED')
      invalid(event.path, 'closed session contains an unresolved dispute');
    unique(pending, JSON.stringify([event.row.sessionId, event.studentToken]), event.path);
  }
  return { data, courses: courses.size };
}
