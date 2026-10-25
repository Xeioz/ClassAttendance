import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import {
  groupMasterRows,
  inspectMasterDraft,
  type MasterClassDraft,
  type MasterRecord,
} from '../src/domain/masterListDraft';
import { importMasterList } from '../src/domain/importMasterList';
import { classStudents, listClasses } from '../src/domain/classes';
import { createSession, closeSession, listSessions, listStudents } from '../src/domain/attendance';
import { mapMasterSheet, readMasterFile, suggestMapping } from '../src/utils/masterList';
import type { VaultKeys } from '../src/types';
let keys: VaultKeys;
const record = (overrides: Partial<MasterRecord> = {}) => ({
  sourceRow: 2,
  id: 'CA202304427',
  name: 'Peña, José',
  section: 'BSIT-3A',
  course: 'IT301',
  term: '2026 / 1',
  subject: '',
  institution: '',
  room: '',
  ...overrides,
});
const draft = (rows = [record()]): MasterClassDraft[] => groupMasterRows(rows);
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
});
describe('master-list reading and missing fields', () => {
  it('accepts missing columns and blank cells without guessing required values', async () => {
    const file = new File(
      [
        '\uFEFFStudent ID,Full Name,Section\r\nCA202304427,"Peña, José",BSIT-3A\r\n\r\nCA202304428,,BSIT-3A',
      ],
      'basic.csv',
    );
    const [sheet] = await readMasterFile(file);
    const mapping = suggestMapping(sheet.headers);
    expect(mapping.course).toBe(-1);
    expect(mapping.term).toBe(-1);
    const rows = mapMasterSheet(sheet, mapping);
    expect(rows[0].course).toBe('');
    expect(rows[1].name).toBe('');
    expect(rows[1].sourceRow).toBe(4);
    const groups = groupMasterRows(rows);
    const result = inspectMasterDraft(groups);
    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['course', 'term', 'name']),
    );
    await expect(importMasterList(keys, groups)).rejects.toThrow('required');
    expect(await db.classes.count()).toBe(0);
  });
  it('does not guess ambiguous headers and rejects duplicate column mapping', () => {
    const sheet = {
      name: 'CSV',
      headers: ['Student ID', 'ID', 'Student Name'],
      rows: [['1', '1', 'Ana']],
    };
    const mapping = suggestMapping(sheet.headers);
    expect(mapping.id).toBe(-1);
    expect(() => mapMasterSheet(sheet, { ...mapping, id: 0, name: 0 })).toThrow('once');
  });
  it('reads multiple Excel sheets and preserves formatted leading-zero IDs', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ID', 'Name', 'Section', 'Course', 'Term'],
      [123, 'Niño, Érica', 'A', 'IT1', '2026'],
    ]);
    sheet.A2.z = '000000';
    XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['ID', 'Name'],
        ['CA2', 'Ana'],
      ]),
      'Other',
    );
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const sheets = await readMasterFile(new File([buffer], 'master.xlsx'));
    expect(sheets.map((item) => item.name)).toEqual(['Students', 'Other']);
    expect(mapMasterSheet(sheets[0], suggestMapping(sheets[0].headers))[0].id).toBe('000123');
  });
  it('handles Windows-1252 CSV and rejects unsupported/oversized inputs', async () => {
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('id,name,section\n1,Pe'),
      0xf1,
      ...new TextEncoder().encode('a,A'),
    ]);
    const [sheet] = await readMasterFile(new File([bytes], 'legacy.csv'));
    expect(sheet.rows[0][1]).toBe('Peña');
    await expect(readMasterFile(new File(['x'], 'file.pdf'))).rejects.toThrow('CSV');
    await expect(
      readMasterFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv')),
    ).rejects.toThrow('5 MB');
  });
});
describe('atomic master-list import', () => {
  it('creates multiple classes with independent enrollment and reuses shared identities', async () => {
    const groups = draft([
      record(),
      record({ course: 'IT302' }),
      record({ id: 'CA202304428', name: 'Ana', course: 'IT302' }),
    ]);
    const result = await importMasterList(keys, groups);
    expect(result.createdClasses).toBe(2);
    expect(result.students).toBe(2);
    expect(result.addedEnrollments).toBe(3);
    const classes = await listClasses(keys);
    expect(
      (await classStudents(keys, classes.find((item) => item.course === 'IT301')!.id)).length,
    ).toBe(1);
    expect(
      (await classStudents(keys, classes.find((item) => item.course === 'IT302')!.id)).length,
    ).toBe(2);
    expect(JSON.stringify(await db.students.toArray())).not.toContain('Peña');
    expect(JSON.stringify(await db.classes.toArray())).not.toContain('IT301');
  });
  it('reuses existing classes, retains omitted enrollment and preserves historical snapshots', async () => {
    const first = await importMasterList(keys, draft());
    const classId = first.classIds[0];
    const session = await createSession(keys, {
      course: 'IT301',
      section: 'BSIT-3A',
      classId,
      roomPin: '123',
      startsAt: Date.now(),
      graceMinutes: 15,
    });
    await closeSession(keys, session);
    const before = (await listSessions(keys))[0];
    const result = await importMasterList(
      keys,
      draft([record({ id: 'CA202304428', name: 'Ana', room: 'New room in file' })]),
    );
    expect(result.createdClasses).toBe(0);
    expect(result.matchedClasses).toBe(1);
    expect(await classStudents(keys, classId)).toHaveLength(2);
    expect((await listClasses(keys))[0].room).toBe('');
    expect((await listSessions(keys))[0]).toEqual(before);
    const repeated = await importMasterList(keys, draft());
    expect(repeated.addedEnrollments).toBe(0);
  });
  it('blocks normalization collisions inside a class but allows the same student across courses', () => {
    expect(
      inspectMasterDraft(draft([record(), record({ id: 'CA-202304427' })])).issues.some((issue) =>
        issue.message.includes('duplicate enrollment'),
      ),
    ).toBe(true);
    expect(inspectMasterDraft(draft([record(), record({ course: 'IT302' })])).issues).toEqual([]);
  });
  it('rejects identity-name conflicts without saving any new class', async () => {
    await importMasterList(keys, draft());
    const conflict = draft([record({ name: 'Different Person', course: 'IT302' })]);
    expect(
      inspectMasterDraft(conflict, await listStudents(keys)).issues.some(
        (issue) => issue.field === 'name',
      ),
    ).toBe(true);
    await expect(importMasterList(keys, conflict)).rejects.toThrow('Name conflict');
    expect(await db.classes.count()).toBe(1);
    expect(await db.enrollments.count()).toBe(1);
  });
  it('rolls back all newly created classes and students when enrollment persistence fails', async () => {
    const failure = vi
      .spyOn(db.enrollments, 'put')
      .mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(importMasterList(keys, draft())).rejects.toThrow('Quota');
    failure.mockRestore();
    expect(await db.classes.count()).toBe(0);
    expect(await db.students.count()).toBe(0);
    expect((await importMasterList(keys, draft())).createdClasses).toBe(1);
  });
  it('blocks import during an active session and leaves drafts available for retry', async () => {
    const groups = draft();
    const first = await importMasterList(keys, groups);
    await createSession(keys, {
      course: 'IT301',
      section: 'BSIT-3A',
      classId: first.classIds[0],
      roomPin: '123',
      startsAt: Date.now(),
      graceMinutes: 15,
    });
    await expect(importMasterList(keys, draft([record({ course: 'IT302' })]))).rejects.toThrow(
      'Close',
    );
    expect(await db.classes.count()).toBe(1);
    expect(groups[0].students[0].name).toBe('Peña, José');
  });
  it('requires consistent defaults when incomplete groups are completed as the same class', () => {
    const groups = draft([record(), record({ course: '', room: 'Lab' })]);
    groups[1].course = 'IT301';
    expect(inspectMasterDraft(groups).issues.some((issue) => issue.field === 'class')).toBe(true);
  });
});
