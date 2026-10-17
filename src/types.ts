export interface Cipher {
  v: 1;
  iv: string;
  data: string;
}
export interface StudentPrivate {
  id: string;
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
  course: string;
  section: string;
  roomPin: string;
  startsAt: number;
  graceMinutes: number;
  roster: Student[];
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
  source: 'QR' | 'MANUAL';
  reason?: string;
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
};
