export interface Cipher {
  v: 1;
  iv: string;
  data: string;
}
export interface StudentPrivate {
  id: string;
  displayId?: string;
  name: string;
  section: string;
}
export interface StudentRow {
  token: string;
  sectionToken: string;
  encrypted: Cipher;
}
export interface Student extends StudentPrivate {
  token: string;
}
export interface SessionPrivate {
  classId?: string;
  course: string;
  section: string;
  roomPin: string;
  startsAt: number;
  graceMinutes: number;
  roster: Student[];
  institution?: string;
  subject?: string;
  room?: string;
  timezone?: string;
  closedAt?: number;
}
export interface ClassPrivate {
  timezone?: string;
  course: string;
  section: string;
  term: string;
  subject: string;
  institution: string;
  room: string;
  graceMinutes: number;
}
export interface ClassRow {
  id: string;
  encrypted: Cipher;
}
export interface ClassOffering extends ClassPrivate {
  id: string;
}
export interface EnrollmentRow {
  classId: string;
  studentToken: string;
}
export interface SessionRow {
  id: string;
  state: 'ACTIVE' | 'CLOSED';
  encrypted: Cipher;
}
export interface Session extends SessionPrivate {
  id: string;
  state: 'ACTIVE' | 'CLOSED';
}
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
export interface AttendancePrivate {
  status: AttendanceStatus;
  at: number;
  source: 'QR' | 'MANUAL' | 'SYSTEM';
  reason?: string;
  originalAt?: number;
  absenceOrigin?: 'CLOSURE' | 'TEACHER';
}
export interface AttendanceRow {
  sessionId: string;
  studentToken: string;
  encrypted: Cipher;
}
export interface EventRow {
  id: string;
  sessionId: string;
  encrypted: Cipher;
}
export interface VaultMeta {
  id: 'vault';
  v: 1;
  iterations: 100000;
  salt: string;
  verifier: Cipher;
}
export interface VaultKeys {
  encryption: CryptoKey;
  index: CryptoKey;
  salt: string;
}
export interface QRPayload {
  v: 1;
  id: string;
  ch: string;
  ts: number;
}
export type ScanResult = {
  kind: 'valid' | 'duplicate' | 'unknown' | 'error';
  title: string;
  detail: string;
  studentToken?: string;
  firstAt?: number;
  secondAt?: number;
};

export interface AuditPayload {
  action: string;
  at: number;
  performedBy: 'TEACHER_PIN' | 'SYSTEM';
  studentToken?: string;
  studentId?: string;
  previousStatus?: AttendanceStatus;
  newStatus?: AttendanceStatus;
  reason?: string;
  firstAt?: number;
  secondAt?: number;
  disputeId?: string;
}
export interface AuditEntry extends AuditPayload {
  eventId: string;
  sessionId: string;
}

/** Reusable settings deliberately exclude session credentials, times, and rosters. */
export interface ClassSettings {
  course: string;
  section: string;
  subject?: string;
  room?: string;
  institution?: string;
  graceMinutes: number;
  timezone: string;
}
export interface ClassTemplate {
  id: string;
  name: string;
  settings: ClassSettings;
  createdAt: number;
  updatedAt: number;
}
export interface TemplateRow {
  id: string;
  encrypted: Cipher;
}

export interface MigrationRow {
  id: string;
  source: string;
  version: 3;
}
