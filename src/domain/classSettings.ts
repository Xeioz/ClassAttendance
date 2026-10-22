import { t } from '../i18n';
import { sectionKey } from '../utils/normalize';
import type { ClassSettings } from '../types';

export type ClassSettingsField = keyof ClassSettings | 'name';
export class ClassSettingsValidationError extends Error {
  constructor(
    public readonly field: ClassSettingsField,
    message: string,
  ) {
    super(message);
    this.name = 'ClassSettingsValidationError';
  }
}

function invalid(field: ClassSettingsField): never {
  throw new ClassSettingsValidationError(field, t(`validation.${field}`));
}

/** Shared by ordinary session creation and template editing. Only reusable fields survive. */
export function validateClassSettings(value: unknown): ClassSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClassSettingsValidationError('course', t('validation.settings'));
  const raw = value as Record<string, unknown>;
  if (typeof raw.course !== 'string' || !raw.course.trim() || raw.course.trim().length > 100)
    invalid('course');
  if (typeof raw.section !== 'string' || !raw.section.trim() || raw.section.trim().length > 100)
    invalid('section');
  if (
    typeof raw.graceMinutes !== 'number' ||
    !Number.isInteger(raw.graceMinutes) ||
    raw.graceMinutes < 0 ||
    raw.graceMinutes > 180
  )
    invalid('graceMinutes');
  const settings: ClassSettings = {
    course: raw.course.trim(),
    section: sectionKey(raw.section),
    graceMinutes: raw.graceMinutes,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  if (settings.section.length > 100) invalid('section');
  for (const field of ['subject', 'room', 'institution'] as const) {
    const value = raw[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length > 150) invalid(field);
    if (value.trim()) settings[field] = value.trim();
  }
  if (raw.timezone !== undefined) {
    if (typeof raw.timezone !== 'string') invalid('timezone');
    if (raw.timezone.trim()) settings.timezone = raw.timezone.trim();
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: settings.timezone }).format(0);
  } catch {
    invalid('timezone');
  }
  return settings;
}

export function validateTemplateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) invalid('name');
  return value.trim();
}
