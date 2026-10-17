import Papa from 'papaparse';
import type { StudentPrivate } from '../types';
import { normalizeId, sectionKey } from './normalize';

export type CSVEncoding = 'auto' | 'utf-8' | 'windows-1252';
export async function readRoster(
  file: File,
  encoding: CSVEncoding,
): Promise<{ rows: StudentPrivate[]; encoding: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Roster must be smaller than 5 MB.');
  const bytes = await file.arrayBuffer();
  let text: string;
  let used: string = encoding;
  if (encoding === 'auto') {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      used = 'utf-8';
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
      used = 'windows-1252 (fallback; confirm preview)';
    }
  } else text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
    dynamicTyping: false,
  });
  if (parsed.errors.length)
    throw new Error(
      `CSV row ${Number(parsed.errors[0].row ?? 0) + 2}: ${parsed.errors[0].message}`,
    );
  if (!['id', 'name', 'section'].every((field) => parsed.meta.fields?.includes(field)))
    throw new Error('Required column headers: id, name, section.');
  if (!parsed.data.length || parsed.data.length > 10000)
    throw new Error('CSV must contain 1–10,000 students.');
  const identities = new Set<string>();
  const rows = parsed.data.map((row, index) => {
    const id = normalizeId(row.id ?? '');
    const name = (row.name ?? '').trim();
    const section = sectionKey(row.section ?? '');
    if (!name || name.length > 200 || !section || section.length > 100)
      throw new Error(`Invalid name or section at row ${index + 2}.`);
    const identity = `${section}:${id}`;
    if (identities.has(identity))
      throw new Error(`Row ${index + 2}: duplicate or normalization collision for ${row.id}.`);
    identities.add(identity);
    return { id, displayId: row.id.trim(), name, section };
  });
  return { rows, encoding: used };
}
