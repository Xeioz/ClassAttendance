import Dexie, { type Table } from 'dexie';
import type {
  AttendanceRow,
  EventRow,
  SessionRow,
  StudentRow,
  TemplateRow,
  VaultMeta,
} from '../types';

export class AttendanceDatabase extends Dexie {
  students!: Table<StudentRow, string>;
  sessions!: Table<SessionRow, string>;
  scanEvents!: Table<EventRow, string>;
  attendance!: Table<AttendanceRow, [string, string]>;
  meta!: Table<VaultMeta, string>;
  classTemplates!: Table<TemplateRow, string>;
  constructor(name = 'attendance-desk-v1') {
    super(name);
    this.version(1).stores({
      students: '&token, sectionToken',
      sessions: '&id, state',
      scanEvents: '&id, sessionId',
      attendance: '[sessionId+studentToken], sessionId',
      meta: '&id',
    });
    // Keep the existing database name and tables. Dexie upgrades v1 in place,
    // adding an empty encrypted-template store without rewriting historical data.
    this.version(2).stores({ classTemplates: '&id' });
  }
}
export const db = new AttendanceDatabase();

export async function requestPersistence(): Promise<string> {
  try {
    if (!navigator.storage?.persist) return 'Persistence API unavailable. Keep encrypted backups.';
    const granted = await navigator.storage.persist();
    const estimate = await navigator.storage.estimate();
    const used = Math.round((estimate.usage ?? 0) / 1024);
    return `${granted ? 'Persistent storage granted' : 'Persistence not granted'} · ${used} KB used. Backups are still required.`;
  } catch {
    return 'Unable to request persistent storage. Keep encrypted backups.';
  }
}
