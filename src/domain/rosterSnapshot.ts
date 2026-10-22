import { db } from '../db/db';
import { decrypt } from '../db/crypto';
import type { Student, StudentPrivate, StudentRow, VaultKeys } from '../types';
import { t } from '../i18n';

/** Compare encrypted rows, so validation needs no asynchronous crypto inside a write transaction. */
export function rosterVersion(rows: StudentRow[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.token.localeCompare(b.token))
      .map((row) => [
        row.token,
        row.sectionToken,
        row.encrypted.v,
        row.encrypted.iv,
        row.encrypted.data,
      ]),
  );
}

export class StaleRosterPreviewError extends Error {
  readonly code = 'ROSTER_CHANGED';
  constructor() {
    super(t('roster.stale'));
    this.name = 'StaleRosterPreviewError';
  }
}

export async function readRosterSnapshot(
  keys: VaultKeys,
): Promise<{ version: string; students: Student[] }> {
  const rows = await db.transaction('r', [db.students, db.meta], async () => {
    if ((await db.meta.get('vault'))?.salt !== keys.salt) throw new Error(t('roster.vaultChanged'));
    return db.students.toArray();
  });
  return {
    version: rosterVersion(rows),
    students: await Promise.all(
      rows.map(async (row) => ({
        ...(await decrypt<StudentPrivate>(keys.encryption, row.encrypted, `student:${row.token}`)),
        token: row.token,
      })),
    ),
  };
}
