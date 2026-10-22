import type { StudentPrivate } from '../types';
import { normalizeId, sectionKey } from './normalize';
import { t } from '../i18n';

/** The displayed spelling never changes the section + canonical-ID identity rule. */
export function normalizeRosterStudent(row: StudentPrivate): StudentPrivate {
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.section !== 'string')
    throw new Error(t('roster.requiredFields'));
  const id = normalizeId(row.id);
  const displayId = row.displayId ?? row.id.trim();
  const name = row.name.trim();
  const section = sectionKey(row.section);
  if (!name || name.length > 200 || !section || section.length > 100)
    throw new Error(t('roster.invalidNameSection'));
  if (typeof displayId !== 'string' || normalizeId(displayId) !== id)
    throw new Error(t('roster.invalidDisplayId'));
  return { id, displayId: displayId.trim(), name, section };
}

export function sameRosterStudent(left: StudentPrivate, right: StudentPrivate): boolean {
  return (
    left.id === right.id &&
    left.section === right.section &&
    left.name === right.name &&
    (left.displayId ?? left.id) === (right.displayId ?? right.id)
  );
}
