import { db } from '../db/db';
import { decrypt, encrypt } from '../db/crypto';
import { t } from '../i18n';
import { validateClassSettings, validateTemplateName } from './classSettings';
import type { ClassSettings, ClassTemplate, TemplateRow, VaultKeys } from '../types';

type TemplatePrivate = Omit<ClassTemplate, 'id'>;
const settingFields = [
  'course',
  'section',
  'subject',
  'room',
  'institution',
  'graceMinutes',
  'timezone',
];
const templateFields = ['name', 'settings', 'createdAt', 'updatedAt'];

/** Also used by recovery: authenticate AND validate every decrypted template field. */
export function validateTemplateData(value: unknown): TemplatePrivate {
  const invalid = (): never => {
    throw new Error(t('validation.templateData'));
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !templateFields.includes(key))) invalid();
  if (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) invalid();
  const source = raw.settings as Record<string, unknown>;
  if (Object.keys(source).some((key) => !settingFields.includes(key))) invalid();
  // Saved templates always have an explicit timezone; recovery cannot depend on this device.
  if (typeof source.timezone !== 'string' || !source.timezone.trim()) invalid();
  const settings = validateClassSettings(source);
  const name = validateTemplateName(raw.name);
  for (const field of ['createdAt', 'updatedAt'] as const) {
    const value = raw[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8.64e15)
      invalid();
  }
  const createdAt = raw.createdAt as number,
    updatedAt = raw.updatedAt as number;
  if (updatedAt < createdAt) invalid();
  return { name, settings, createdAt, updatedAt };
}

async function assertVault(keys: VaultKeys): Promise<void> {
  if ((await db.meta.get('vault'))?.salt !== keys.salt)
    throw new Error(t('validation.vaultChanged'));
}
async function readTemplate(keys: VaultKeys, row: TemplateRow): Promise<ClassTemplate> {
  const value = await decrypt<unknown>(keys.encryption, row.encrypted, `class-template:${row.id}`);
  return { id: row.id, ...validateTemplateData(value) };
}

export async function listTemplates(keys: VaultKeys): Promise<ClassTemplate[]> {
  const rows = await db.transaction('r', [db.meta, db.classTemplates], async () => {
    await assertVault(keys);
    return db.classTemplates.toArray();
  });
  const templates = await Promise.all(rows.map((row) => readTemplate(keys, row)));
  return templates.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function saveTemplate(
  keys: VaultKeys,
  input: { id?: string; name: string; settings: ClassSettings; expectedUpdatedAt?: number },
): Promise<ClassTemplate> {
  const name = validateTemplateName(input.name),
    settings = validateClassSettings(input.settings);
  if (
    input.id !== undefined &&
    (typeof input.id !== 'string' || !input.id || input.id.length > 511)
  )
    throw new Error(t('validation.templateData'));
  const previous = input.id ? await db.classTemplates.get(input.id) : undefined;
  if (input.id && !previous) throw new Error(t('validation.templateMissing'));
  const original = previous ? await readTemplate(keys, previous) : undefined;
  if (
    original &&
    input.expectedUpdatedAt !== undefined &&
    original.updatedAt !== input.expectedUpdatedAt
  )
    throw new Error(t('validation.templateChanged'));
  const now = Date.now();
  const value: TemplatePrivate = {
    name,
    settings,
    createdAt: original?.createdAt ?? now,
    updatedAt: Math.max(now, original ? original.updatedAt + 1 : now),
  };
  const id = input.id ?? crypto.randomUUID();
  const row: TemplateRow = {
    id,
    encrypted: await encrypt(keys.encryption, value, `class-template:${id}`),
  };
  await db.transaction('rw', [db.meta, db.classTemplates], async () => {
    await assertVault(keys);
    if (previous) {
      const current = await db.classTemplates.get(id);
      if (JSON.stringify(current) !== JSON.stringify(previous))
        throw new Error(t('validation.templateChanged'));
      await db.classTemplates.put(row);
    } else await db.classTemplates.add(row);
  });
  return { id, ...value };
}

export async function duplicateTemplate(
  keys: VaultKeys,
  id: string,
  name?: string,
): Promise<ClassTemplate> {
  const row = await db.classTemplates.get(id);
  if (!row) throw new Error(t('validation.templateMissing'));
  const template = await readTemplate(keys, row);
  return saveTemplate(keys, {
    name: name ?? t('validation.templateCopy', { name: template.name.slice(0, 90) }),
    settings: template.settings,
  });
}

export async function deleteTemplate(
  keys: VaultKeys,
  id: string,
  expectedUpdatedAt?: number,
): Promise<void> {
  const previous = await db.classTemplates.get(id);
  if (!previous) {
    // Idempotent removal still rejects a vault replaced in another tab.
    await assertVault(keys);
    return;
  }
  const original = await readTemplate(keys, previous);
  if (expectedUpdatedAt !== undefined && original.updatedAt !== expectedUpdatedAt)
    throw new Error(t('validation.templateChanged'));
  await db.transaction('rw', [db.meta, db.classTemplates], async () => {
    await assertVault(keys);
    if (JSON.stringify(await db.classTemplates.get(id)) !== JSON.stringify(previous))
      throw new Error(t('validation.templateChanged'));
    await db.classTemplates.delete(id);
  });
}
