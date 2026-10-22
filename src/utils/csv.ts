import Papa from 'papaparse';
import type { StudentPrivate } from '../types';
import { normalizeRosterStudent } from './rosterValidation';
import { t } from '../i18n';

export type CSVEncoding = 'auto' | 'utf-8' | 'windows-1252';
export interface InspectedRosterRow {
  /** Logical CSV record number, including the header, even for quoted multiline fields. */
  line: number;
  raw: { id: string; name: string; section: string };
  student?: StudentPrivate;
  issueKind?: 'invalid' | 'conflict';
  issue?: string;
}
export interface RosterInspection {
  rows: InspectedRosterRow[];
  encoding: string;
}

export async function inspectRoster(file: File, encoding: CSVEncoding): Promise<RosterInspection> {
  if (file.size > 5 * 1024 * 1024) throw new Error(t('roster.fileLimit'));
  const bytes = await file.arrayBuffer();
  let text: string;
  let used: string = encoding;
  if (encoding === 'auto') {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      used = 'utf-8';
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
      used = t('roster.encodingFallback');
    }
  } else text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
    dynamicTyping: false,
  });
  const fatalError = parsed.errors.find((error) => error.type !== 'FieldMismatch');
  if (fatalError)
    throw new Error(
      t('roster.csvError', {
        row: Number(fatalError.row ?? 0) + 2,
        message: fatalError.message,
      }),
    );
  if (!['id', 'name', 'section'].every((field) => parsed.meta.fields?.includes(field)))
    throw new Error(t('roster.requiredHeaders'));
  if (!parsed.data.length || parsed.data.length > 10000) throw new Error(t('roster.rowLimit'));
  const identities = new Map<string, InspectedRosterRow[]>();
  const parseErrors = new Map(parsed.errors.map((error) => [error.row, error]));
  const rows = parsed.data.map((row, index): InspectedRosterRow => {
    const raw = { id: row.id ?? '', name: row.name ?? '', section: row.section ?? '' };
    const result: InspectedRosterRow = { line: index + 2, raw };
    try {
      const parseError = parseErrors.get(index);
      if (parseError) throw new Error(t('roster.columnMismatch'));
      result.student = normalizeRosterStudent(raw);
      const identity = `${result.student.section}:${result.student.id}`;
      const group = identities.get(identity) ?? [];
      group.push(result);
      identities.set(identity, group);
    } catch (error) {
      result.issueKind = 'invalid';
      result.issue = error instanceof Error ? error.message : t('roster.requiredFields');
    }
    return result;
  });
  for (const group of identities.values()) {
    if (group.length < 2) continue;
    const issue = t('roster.fileConflict', { rows: group.map((entry) => entry.line).join(', ') });
    for (const row of group) {
      row.issueKind = 'conflict';
      row.issue = issue;
    }
  }
  return { rows, encoding: used };
}

/** Compatibility reader for consumers that require a completely valid roster. */
export async function readRoster(
  file: File,
  encoding: CSVEncoding,
): Promise<{ rows: StudentPrivate[]; encoding: string }> {
  const inspection = await inspectRoster(file, encoding);
  const problem = inspection.rows.find((row) => row.issueKind);
  if (problem)
    throw new Error(t('roster.rowIssue', { row: problem.line, message: problem.issue ?? '' }));
  return { rows: inspection.rows.map((row) => row.student!), encoding: inspection.encoding };
}
