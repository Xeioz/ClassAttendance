import { listClasses } from './classes';
import type { Student, VaultKeys } from '../types';
import type { InspectedRosterRow, RosterInspection } from '../utils/csv';
import { sameRosterStudent } from '../utils/rosterValidation';
import { saveRoster } from './attendance';
import { readRosterSnapshot } from './rosterSnapshot';
import { t } from '../i18n';

export const rosterCategories = ['added', 'updated', 'unchanged', 'invalid', 'conflict'] as const;
export type RosterCategory = (typeof rosterCategories)[number];
export interface RosterReviewRow extends InspectedRosterRow {
  category: RosterCategory;
  before?: Student;
}
export interface RosterReview {
  classId?: string;
  inspection: RosterInspection;
  version: string;
  rows: RosterReviewRow[];
  counts: Record<RosterCategory, number>;
}

export async function prepareRosterImport(
  keys: VaultKeys,
  inspection: RosterInspection,
  classId?: string,
): Promise<RosterReview> {
  if (classId) {
    const offering = (await listClasses(keys)).find((item) => item.id === classId);
    if (
      !offering ||
      inspection.rows.some((row) => row.student && row.student.section !== offering.section)
    )
      throw new Error('CSV section does not match the selected class.');
  }
  const snapshot = await readRosterSnapshot(keys);
  const existing = new Map(
    snapshot.students.map((student) => [`${student.section}:${student.id}`, student]),
  );
  const counts: Record<RosterCategory, number> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    conflict: 0,
  };
  const rows = inspection.rows.map((row): RosterReviewRow => {
    const before = row.student && existing.get(`${row.student.section}:${row.student.id}`);
    const category =
      row.issueKind ??
      (!before ? 'added' : sameRosterStudent(before, row.student!) ? 'unchanged' : 'updated');
    counts[category]++;
    return { ...row, before, category };
  });
  return { classId, inspection, version: snapshot.version, rows, counts };
}

export async function commitRosterImport(
  keys: VaultKeys,
  review: RosterReview,
  approvedUpdates: ReadonlySet<number>,
): Promise<Record<RosterCategory, number>> {
  if (review.counts.invalid || review.counts.conflict) throw new Error(t('roster.blockingRule'));
  if (review.rows.some((row) => row.category === 'updated' && !approvedUpdates.has(row.line)))
    throw new Error(t('roster.approvalsRequired'));
  await saveRoster(
    keys,
    review.rows.map((row) => row.student!),
    { expectedVersion: review.version, classId: review.classId },
  );
  return review.counts;
}
