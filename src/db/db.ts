import { prepareDatabase } from './compatibility';
import Dexie, { type Table } from 'dexie';
import type {
  AttendanceRow,
  EventRow,
  SessionRow,
  StudentRow,
  VaultMeta,
  ClassRow,
  EnrollmentRow,
  TemplateRow,
  MigrationRow,
} from '../types';

export class AttendanceDatabase extends Dexie {
  students!: Table<StudentRow, string>;
  sessions!: Table<SessionRow, string>;
  scanEvents!: Table<EventRow, string>;
  attendance!: Table<AttendanceRow, [string, string]>;
  meta!: Table<VaultMeta, string>;
  classes!: Table<ClassRow, string>;
  enrollments!: Table<EnrollmentRow, [string, string]>;
  classTemplates!: Table<TemplateRow, string>;
  migrations!: Table<MigrationRow, string>;
  private opening?: ReturnType<Dexie['open']>;
  override open(): ReturnType<Dexie['open']> {
    if (!this.opening) {
      this.opening = Dexie.Promise.resolve(prepareDatabase(this.name))
        .then(() => super.open())
        .finally(() => {
          this.opening = undefined;
        });
    }
    return this.opening;
  }
  constructor(name = 'attendance-desk-v1') {
    super(name);
    this.version(1).stores({
      students: '&token, sectionToken',
      sessions: '&id, state',
      scanEvents: '&id, sessionId',
      attendance: '[sessionId+studentToken], sessionId',
      meta: '&id',
    });
    // Additive upgrade: encrypted legacy records and their identities are untouched.
    this.version(2).stores({
      classes: '&id',
      enrollments: '[classId+studentToken], classId, studentToken',
    });
    this.version(3).stores({ classTemplates: '&id', migrations: '&id' });
    this.on('versionchange', () => {
      this.close();
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('attendance:database-changed'));
    });
    this.on('blocked', () => {
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('attendance:database-blocked'));
    });
  }
}
export const db = new AttendanceDatabase();

export { requestPersistence } from './persistence';
