import { db } from './db';
import { decrypt, deriveKeys, encrypt } from './crypto';
import { downloadFile } from '../utils/download';
import {
  validateBackupData,
  validateBackupSize,
  validateCipher,
  validateVaultMeta,
} from './backupValidation';
import type { Cipher, VaultKeys, VaultMeta } from '../types';

interface BackupFile {
  format: 'attendance-desk';
  v: 2;
  meta: VaultMeta;
  payload: Cipher;
}

export async function exportBackup(keys: VaultKeys): Promise<void> {
  const snapshot = await db.transaction(
    'r',
    [db.meta, db.students, db.sessions, db.attendance, db.scanEvents, db.classTemplates],
    async () => ({
      meta: await db.meta.get('vault'),
      students: await db.students.toArray(),
      sessions: await db.sessions.toArray(),
      attendance: await db.attendance.toArray(),
      scanEvents: await db.scanEvents.toArray(),
      classTemplates: await db.classTemplates.toArray(),
    }),
  );
  if (!snapshot.meta) throw new Error('No vault to back up.');
  if (snapshot.meta.salt !== keys.salt)
    throw new Error('The vault changed in another tab. Lock and unlock again.');
  const meta = validateVaultMeta(snapshot.meta);
  if ((await decrypt<unknown>(keys.encryption, meta.verifier, 'vault:v1')) !== 'attendance-desk')
    throw new Error('Invalid backup key verifier.');
  // Shared checks prevent offering files outside this application's recovery contract.
  const { data } = await validateBackupData(snapshot, keys, 2);
  const file: BackupFile = {
    format: 'attendance-desk',
    v: 2,
    meta,
    payload: await encrypt(keys.encryption, data, 'backup:v2'),
  };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  validateBackupSize(blob.size);
  downloadFile(blob, `attendance_backup_${new Date().toISOString().slice(0, 10)}.enc.json`);
}

export async function restoreBackup(
  file: File,
  pin: string,
): Promise<{ students: number; sessions: number; courses: number }> {
  validateBackupSize(file.size);
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('Unsupported backup format: invalid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Unsupported backup format.');
  const envelope = raw as Record<string, unknown>;
  if (envelope.format !== 'attendance-desk' || (envelope.v !== 1 && envelope.v !== 2))
    throw new Error('Unsupported backup format.');
  const meta = validateVaultMeta(envelope.meta);
  const payload = validateCipher(envelope.payload, 'payload');
  const keys = await deriveKeys(pin, meta.salt);
  if ((await decrypt<unknown>(keys.encryption, meta.verifier, 'vault:v1')) !== 'attendance-desk')
    throw new Error('Wrong backup PIN.');
  const { data, courses } = await validateBackupData(
    await decrypt<unknown>(keys.encryption, payload, `backup:v${envelope.v}`),
    keys,
    envelope.v,
  );
  // Validation finishes before touching existing data. Write failures roll back this
  // atomic replacement transaction, including the original vault metadata.
  await db.transaction(
    'rw',
    [db.meta, db.students, db.sessions, db.attendance, db.scanEvents, db.classTemplates],
    async () => {
      await Promise.all([
        db.meta.clear(),
        db.students.clear(),
        db.sessions.clear(),
        db.attendance.clear(),
        db.scanEvents.clear(),
        db.classTemplates.clear(),
      ]);
      await db.meta.add(meta);
      await db.students.bulkAdd(data.students);
      await db.sessions.bulkAdd(data.sessions);
      await db.attendance.bulkAdd(data.attendance);
      await db.scanEvents.bulkAdd(data.scanEvents);
      await db.classTemplates.bulkAdd(data.classTemplates);
    },
  );
  return { students: data.students.length, sessions: data.sessions.length, courses };
}
