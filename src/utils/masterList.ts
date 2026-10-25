import Papa from 'papaparse';
import { masterFields, type MasterField, type MasterRecord } from '../domain/masterListDraft';

export interface MasterSheet {
  name: string;
  headers: string[];
  rows: string[][];
  sourceRows?: number[];
}
export type ColumnMapping = Record<MasterField, number>;
const aliases: Record<MasterField, string[]> = {
  id: ['id', 'studentid', 'studentnumber', 'studentno', 'idnumber'],
  name: ['name', 'studentname', 'fullname', 'officialname'],
  section: ['section', 'classsection', 'block'],
  course: ['course', 'coursecode', 'subjectcode'],
  term: ['term', 'semester', 'academicterm'],
  subject: ['subject', 'subjectname', 'coursename'],
  institution: ['institution', 'school', 'schoolname'],
  room: ['room', 'classroom'],
};
const headerKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function suggestMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    masterFields.map((field) => {
      const matches = headers
        .map((header, index) => (aliases[field].includes(headerKey(header)) ? index : -1))
        .filter((index) => index >= 0);
      return [field, matches.length === 1 ? matches[0] : -1];
    }),
  ) as ColumnMapping;
}
function toSheet(name: string, matrix: string[][]): MasterSheet {
  const populated = matrix
    .map((row, index) => ({ row, source: index + 1 }))
    .filter(({ row }) => row.some((cell) => cell.trim()));
  const rows = populated.map(({ row }) => row);
  if (rows.length < 2 || rows.length > 10001)
    throw new Error('Each selected sheet must have a header and 1–10,000 data rows.');
  const width = Math.max(...rows.map((row) => row.length));
  if (width > 100) throw new Error('Master lists support at most 100 columns.');
  return {
    name,
    headers: Array.from(
      { length: width },
      (_, index) => rows[0][index]?.trim() || `Column ${index + 1}`,
    ),
    rows: rows.slice(1),
    sourceRows: populated.slice(1).map(({ source }) => source),
  };
}
export async function readMasterFile(file: File): Promise<MasterSheet[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Master list must be smaller than 5 MB.');
  const bytes = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
      header: false,
      skipEmptyLines: false,
      dynamicTyping: false,
    });
    if (parsed.errors.length) throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`);
    return [toSheet('CSV', parsed.data)];
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Choose a CSV, XLSX or XLS file.');
  // The same bundled SheetJS chunk used by reports is precached for offline imports.
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(bytes, {
    type: 'array',
    sheetRows: 10002,
    cellFormula: false,
    cellHTML: false,
  });
  if (workbook.SheetNames.length > 20) throw new Error('Workbooks support at most 20 worksheets.');
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
    if (range.e.r > 10000 || range.e.c > 99)
      throw new Error(`Worksheet “${name}” exceeds the row/column limit.`);
    // Formatted text preserves displayed leading zeros; formulas are never evaluated.
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
      range: 0,
    });
    if (matrix.length < 2) return [];
    return [toSheet(name, matrix)];
  });
}
export function mapMasterSheet(
  sheet: MasterSheet,
  mapping: ColumnMapping,
): Array<MasterRecord & { sourceRow: number }> {
  const selected = Object.values(mapping).filter((index) => index >= 0);
  if (new Set(selected).size !== selected.length) throw new Error('Map each source column once.');
  if (!selected.length) throw new Error('Map at least one column from your file.');
  if (selected.some((index) => !Number.isInteger(index) || index >= sheet.headers.length))
    throw new Error('Invalid column mapping.');
  return sheet.rows.map((row, index) => ({
    sourceRow: sheet.sourceRows?.[index] ?? index + 2,
    ...(Object.fromEntries(
      masterFields.map((field) => [
        field,
        mapping[field] < 0 ? '' : (row[mapping[field]] ?? '').trim(),
      ]),
    ) as MasterRecord),
  }));
}
