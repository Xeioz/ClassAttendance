import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceDatabase, db } from '../src/db/db';
import { decrypt, encrypt } from '../src/db/crypto';
import { exportBackup, restoreBackup } from '../src/db/backup';
import { validateBackupData, type BackupData } from '../src/db/backupValidation';
import { unlockVault } from '../src/db/vault';
import {
  closeSession,
  createSession,
  recordAttendance,
  saveRoster,
} from '../src/domain/attendance';
import { ClassSettingsValidationError, validateClassSettings } from '../src/domain/classSettings';
import {
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  saveTemplate,
} from '../src/domain/templates';
import { downloadFile } from '../src/utils/download';
import type { ClassSettings, Cipher, VaultKeys, VaultMeta } from '../src/types';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
const pin = '104928573612';
const now = Date.UTC(2026, 9, 22, 10);
const settings: ClassSettings = {
  course: 'Synthetic Biology 101',
  section: 'A',
  subject: 'Cell biology',
  room: 'Lab 2',
  institution: 'Synthetic school',
  graceMinutes: 15,
  timezone: 'Asia/Manila',
};
let keys: VaultKeys;

async function snapshot() {
  return db.transaction('r', db.tables, async () => ({
    meta: await db.meta.toArray(),
    students: await db.students.toArray(),
    sessions: await db.sessions.toArray(),
    attendance: await db.attendance.toArray(),
    scanEvents: await db.scanEvents.toArray(),
    classTemplates: await db.classTemplates.toArray(),
  }));
}
async function history() {
  await saveRoster(keys, [{ id: '00-1', name: 'Synthetic Student', section: 'A' }]);
  const session = await createSession(keys, {
    ...settings,
    roomPin: '492',
    startsAt: now,
  });
  await recordAttendance(
    keys,
    session.id,
    { student: session.roster[0], reason: 'Synthetic ID verified' },
    now,
  );
  return session;
}
async function backupFile(data: unknown, version: 1 | 2 = 2) {
  return new File(
    [
      JSON.stringify({
        format: 'attendance-desk',
        v: version,
        meta: await db.meta.get('vault'),
        payload: await encrypt(keys.encryption, data, `backup:v${version}`),
      }),
    ],
    'synthetic-backup.enc.json',
  );
}
async function capturedExport() {
  await exportBackup(keys);
  const blob = vi.mocked(downloadFile).mock.calls.at(-1)![0];
  return new File([blob], 'synthetic-backup.enc.json');
}
async function replaceTemplatePayload(data: BackupData, payload: unknown) {
  const row = data.classTemplates![0];
  row.encrypted = await encrypt(keys.encryption, payload, `class-template:${row.id}`);
}
async function decryptedTemplate(data: BackupData) {
  const row = data.classTemplates![0];
  return decrypt<Record<string, unknown>>(
    keys.encryption,
    row.encrypted,
    `class-template:${row.id}`,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault(pin);
});
afterEach(() => vi.restoreAllMocks());

describe('shared reusable class settings', () => {
  it('normalizes the same settings used by templates and ordinary sessions and strips session values', async () => {
    const input = {
      ...settings,
      course: '  Synthetic Biology 101 ',
      section: ' a ',
      room: ' ',
      startsAt: now,
      roomPin: '492',
    };
    const normalized = validateClassSettings(input);
    expect(normalized).toEqual({ ...settings, room: undefined });
    expect(Object.keys(normalized)).not.toContain('startsAt');
    expect(Object.keys(normalized)).not.toContain('roomPin');
    const template = await saveTemplate(keys, { name: '  Tuesday class  ', settings: input });
    expect(template.settings).toEqual(normalized);
    expect(template.name).toBe('Tuesday class');
  });

  it.each([
    ['course', ''],
    ['section', ''],
    ['graceMinutes', -1],
    ['graceMinutes', 1.5],
    ['graceMinutes', 181],
    ['timezone', 'No/Such_Zone'],
    ['room', 'x'.repeat(151)],
    ['subject', 123],
    ['institution', {}],
  ])('reports the invalid %s field without saving anything', async (field, value) => {
    await expect(
      saveTemplate(keys, {
        name: 'Invalid class',
        settings: { ...settings, [field]: value },
      }),
    ).rejects.toMatchObject({ name: 'ClassSettingsValidationError', field });
    expect(await db.classTemplates.count()).toBe(0);
  });

  it('reports a blank template name against its own field', async () => {
    await expect(saveTemplate(keys, { name: ' ', settings })).rejects.toMatchObject({
      field: 'name',
    });
    expect(() => validateClassSettings(null)).toThrow(ClassSettingsValidationError);
  });
});

describe('encrypted class template persistence', () => {
  it('stores only ID and authenticated ciphertext, reopens offline, and rejects swapped ciphertext', async () => {
    const first = await saveTemplate(keys, { name: 'Synthetic Tuesday class', settings });
    const second = await saveTemplate(keys, { name: 'Synthetic Wednesday class', settings });
    const rows = await db.classTemplates.toArray();
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      ['encrypted', 'id'],
      ['encrypted', 'id'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Synthetic');
    expect(JSON.stringify(rows)).not.toContain('Asia/Manila');
    db.close();
    await db.open();
    keys = await unlockVault(pin);
    expect(await listTemplates(keys)).toEqual([first, second]);
    const firstRow = await db.classTemplates.get(first.id);
    await db.classTemplates.update(second.id, { encrypted: firstRow!.encrypted });
    await expect(listTemplates(keys)).rejects.toThrow(/decrypt/);
  });

  it('edits and removes templates independently of duplicates, active sessions, and closed history', async () => {
    const active = await history();
    const original = await saveTemplate(keys, { name: 'Tuesday class', settings });
    const copied = await duplicateTemplate(keys, original.id);
    expect(copied.id).not.toBe(original.id);
    expect(copied.name).toBe('Tuesday class (copy)');
    const before = await snapshot();
    const edited = await saveTemplate(keys, {
      id: original.id,
      name: 'New Tuesday room',
      settings: { ...settings, room: 'Lab 9' },
    });
    expect(edited.createdAt).toBe(original.createdAt);
    expect((await listTemplates(keys)).find((item) => item.id === copied.id)).toEqual(copied);
    await deleteTemplate(keys, original.id);
    const after = await snapshot();
    for (const name of ['meta', 'students', 'sessions', 'attendance', 'scanEvents'] as const)
      expect(after[name]).toEqual(before[name]);
    await closeSession(keys, active);
    const closed = await snapshot();
    await deleteTemplate(keys, copied.id);
    const removed = await snapshot();
    for (const name of ['meta', 'students', 'sessions', 'attendance', 'scanEvents'] as const)
      expect(removed[name]).toEqual(closed[name]);
    expect(removed.classTemplates).toEqual([]);
  });

  it('rolls back failed edits and rejects stale vault keys for every mutation', async () => {
    const template = await saveTemplate(keys, { name: 'Tuesday class', settings });
    const before = await snapshot();
    vi.spyOn(db.classTemplates, 'put').mockRejectedValueOnce(new Error('Synthetic quota failure'));
    await expect(saveTemplate(keys, { ...template, name: 'New name' })).rejects.toThrow('quota');
    expect(await snapshot()).toEqual(before);
    const stale = { ...keys, salt: 'stale' };
    await expect(saveTemplate(stale, { name: 'Another', settings })).rejects.toThrow(
      'vault changed',
    );
    await expect(saveTemplate(stale, { ...template, name: 'Changed' })).rejects.toThrow(
      'vault changed',
    );
    await expect(duplicateTemplate(stale, template.id)).rejects.toThrow('vault changed');
    await expect(deleteTemplate(stale, template.id)).rejects.toThrow('vault changed');
    expect(await snapshot()).toEqual(before);
  });

  it('rejects stale edits and deletion after a change in another tab, including equal-clock writes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const original = await saveTemplate(keys, { name: 'Tuesday class', settings });
    const updated = await saveTemplate(keys, {
      ...original,
      name: 'Changed in another tab',
      expectedUpdatedAt: original.updatedAt,
    });
    expect(updated.updatedAt).toBe(original.updatedAt + 1);
    await expect(
      saveTemplate(keys, {
        ...original,
        name: 'Stale edit',
        expectedUpdatedAt: original.updatedAt,
      }),
    ).rejects.toThrow('changed in another tab');
    await expect(deleteTemplate(keys, original.id, original.updatedAt)).rejects.toThrow(
      'changed in another tab',
    );
    expect(await listTemplates(keys)).toEqual([updated]);
    await deleteTemplate(keys, updated.id, updated.updatedAt);
    expect(await listTemplates(keys)).toEqual([]);
  });

  it('upgrades an actual v1 database without rewriting any historical rows', async () => {
    await history();
    const original = await snapshot();
    const name = `synthetic-v1-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      students: '&token, sectionToken',
      sessions: '&id, state',
      scanEvents: '&id, sessionId',
      attendance: '[sessionId+studentToken], sessionId',
      meta: '&id',
    });
    const tableNames = ['students', 'sessions', 'scanEvents', 'attendance', 'meta'] as const;
    for (const table of tableNames) await old.table(table).bulkAdd(original[table]);
    old.close();
    const upgraded = new AttendanceDatabase(name);
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(3);
      expect(await upgraded.classTemplates.toArray()).toEqual([]);
      for (const table of tableNames)
        expect(await upgraded.table(table).toArray()).toEqual(original[table]);
    } finally {
      upgraded.close();
      await Dexie.delete(name);
    }
  });
});

describe('version-aware template backup recovery', () => {
  it('exports v3 with templates and restores every record and original encrypted value', async () => {
    await history();
    const template = await saveTemplate(keys, { name: 'Tuesday class', settings });
    const before = await snapshot();
    const file = await capturedExport();
    const envelope = JSON.parse(await file.text()) as {
      v: number;
      payload: Cipher;
      meta: VaultMeta;
    };
    expect(envelope.v).toBe(3);
    const data = await decrypt<BackupData>(keys.encryption, envelope.payload, 'backup:v3');
    expect(data.classTemplates).toEqual(before.classTemplates);
    await expect(decrypt(keys.encryption, envelope.payload, 'backup:v1')).rejects.toThrow();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await restoreBackup(file, pin);
    expect(await snapshot()).toEqual(before);
    expect(await listTemplates(await unlockVault(pin))).toEqual([template]);
  });

  it('restores a valid legacy v1 backup and removes templates absent from that workspace', async () => {
    await history();
    const before = await snapshot();
    const { meta: _meta, classTemplates: _templates, ...legacy } = before;
    const file = await backupFile(legacy, 1);
    await saveTemplate(keys, { name: 'Created after the backup', settings });
    await restoreBackup(file, pin);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['name', { name: { invalid: true } }],
    ['settings', { settings: { ...settings, graceMinutes: -1 } }],
    ['timezone', { settings: { ...settings, timezone: undefined } }],
    ['session credentials', { settings: { ...settings, roomPin: '492' } }],
    ['session history', { settings: { ...settings, roster: [] } }],
    ['timestamp', { updatedAt: -1 }],
    ['identity alias', { id: 'different-template' }],
  ])(
    'rejects authenticated malformed %s before replacing any table or vault metadata',
    async (_label, patch) => {
      await history();
      await saveTemplate(keys, { name: 'Keep this template', settings });
      const before = await snapshot(),
        data = structuredClone(before);
      const payload = await decryptedTemplate(data);
      await replaceTemplatePayload(data, { ...payload, ...patch });
      await expect(restoreBackup(await backupFile(data), pin)).rejects.toThrow(
        /classTemplates\[0\]/,
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('requires templates in v2, rejects duplicates and unsupported versions, and preserves all data', async () => {
    await history();
    await saveTemplate(keys, { name: 'Keep this template', settings });
    const before = await snapshot();
    const { classTemplates: _templates, ...missing } = before;
    await expect(restoreBackup(await backupFile(missing), pin)).rejects.toThrow('ambiguous');
    await expect(restoreBackup(await backupFile(before, 1), pin)).rejects.toThrow(
      'unexpected legacy tables',
    );
    await expect(
      validateBackupData(
        { ...before, classTemplates: [...before.classTemplates, ...before.classTemplates] },
        keys,
        2,
      ),
    ).rejects.toThrow(/duplicate/);
    const envelope = JSON.parse(await (await capturedExport()).text());
    envelope.v = 99;
    await expect(
      restoreBackup(new File([JSON.stringify(envelope)], 'unsupported.json'), pin),
    ).rejects.toThrow('format');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back all replaced tables and vault metadata when the template write fails last', async () => {
    await history();
    await saveTemplate(keys, { name: 'Original template', settings });
    const file = await capturedExport();
    // Recovering a backup from a different vault must roll back its new key metadata too.
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    keys = await unlockVault(pin);
    await history();
    await saveTemplate(keys, { name: 'Must survive recovery failure', settings });
    const before = await snapshot();
    vi.spyOn(db.classTemplates, 'bulkAdd').mockRejectedValueOnce(
      new Error('Synthetic quota failure'),
    );
    await expect(restoreBackup(file, pin)).rejects.toThrow('quota');
    expect(await snapshot()).toEqual(before);
    expect(await listTemplates(await unlockVault(pin))).toHaveLength(1);
  });

  it('refuses to export corrupted templates as a recoverable backup', async () => {
    await saveTemplate(keys, { name: 'Tuesday class', settings });
    const data = await snapshot();
    const payload = await decryptedTemplate(data);
    await replaceTemplatePayload(data, {
      ...payload,
      settings: { ...settings, graceMinutes: 999 },
    });
    await db.classTemplates.put(data.classTemplates[0]);
    await expect(exportBackup(keys)).rejects.toThrow('classTemplates');
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
