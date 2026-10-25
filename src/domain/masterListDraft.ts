import type { ClassPrivate, Student, StudentPrivate } from '../types';
import { normalizeId, sectionKey } from '../utils/normalize';

export const masterFields = [
  'id',
  'name',
  'section',
  'course',
  'term',
  'subject',
  'institution',
  'room',
] as const;
export type MasterField = (typeof masterFields)[number];
export type MasterRecord = Record<MasterField, string>;
export interface MasterStudentDraft {
  key: string;
  sourceRow: number;
  id: string;
  name: string;
}
export interface MasterClassDraft extends ClassPrivate {
  key: string;
  students: MasterStudentDraft[];
}
export interface MasterIssue {
  groupKey: string;
  rowKey?: string;
  field: string;
  message: string;
}
export interface PreparedMasterClass {
  data: ClassPrivate;
  students: StudentPrivate[];
}
export const classIdentity = (value: Pick<ClassPrivate, 'course' | 'section' | 'term'>) =>
  JSON.stringify([
    value.course.trim().toLowerCase(),
    sectionKey(value.section),
    value.term.trim().toLowerCase(),
  ]);

export function groupMasterRows(
  rows: Array<MasterRecord & { sourceRow: number }>,
): MasterClassDraft[] {
  const groups = new Map<string, MasterClassDraft>();
  for (const row of rows) {
    // Optional metadata stays separate when it differs, so conflicting values cannot disappear.
    const identity = JSON.stringify([classIdentity(row), row.subject, row.institution, row.room]);
    let group = groups.get(identity);
    if (!group) {
      group = {
        key: crypto.randomUUID(),
        course: row.course,
        section: row.section,
        term: row.term,
        subject: row.subject,
        institution: row.institution,
        room: row.room,
        graceMinutes: 15,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        students: [],
      };
      groups.set(identity, group);
    }
    group.students.push({
      key: crypto.randomUUID(),
      sourceRow: row.sourceRow,
      id: row.id,
      name: row.name,
    });
  }
  return [...groups.values()];
}

export function inspectMasterDraft(groups: MasterClassDraft[], existing: Student[] = []) {
  const issues: MasterIssue[] = [];
  const prepared = new Map<string, PreparedMasterClass>();
  const enrollment = new Set<string>();
  const names = new Map(
    existing.map((student) => [JSON.stringify([student.section, student.id]), student.name]),
  );
  const total = groups.reduce((count, group) => count + group.students.length, 0);
  if (!groups.length || groups.length > 1000 || total < 1 || total > 10000)
    issues.push({
      groupKey: '',
      field: 'file',
      message: 'Import 1–10,000 enrollment rows across at most 1,000 class groups.',
    });
  for (const group of groups) {
    const add = (field: string, message: string, rowKey?: string) =>
      issues.push({ groupKey: group.key, rowKey, field, message });
    for (const field of ['course', 'section', 'term'] as const)
      if (!group[field].trim())
        add(
          field,
          `${field === 'course' ? 'Course' : field === 'section' ? 'Section' : 'Term'} is required. Fill the blank field.`,
        );
    for (const field of ['course', 'section', 'term', 'subject', 'institution', 'room'] as const)
      if (group[field].length > (field === 'section' || field === 'course' ? 100 : 150))
        add(field, `${field} is too long.`);
    if (!Number.isInteger(group.graceMinutes) || group.graceMinutes < 0 || group.graceMinutes > 180)
      add('graceMinutes', 'Grace must be 0–180 whole minutes.');
    try {
      if (group.timezone) new Intl.DateTimeFormat('en', { timeZone: group.timezone });
    } catch {
      add('timezone', 'Invalid report timezone.');
    }
    if (!group.students.length) add('students', 'Each class needs at least one student.');
    const data: ClassPrivate = {
      course: group.course.trim(),
      section: sectionKey(group.section),
      term: group.term.trim(),
      subject: group.subject.trim(),
      institution: group.institution.trim(),
      room: group.room.trim(),
      graceMinutes: group.graceMinutes,
      timezone: group.timezone,
    };
    const identity = classIdentity(data);
    const prior = prepared.get(identity);
    if (prior && JSON.stringify(prior.data) !== JSON.stringify(data))
      add(
        'class',
        'These class groups now match but have conflicting defaults. Make their optional fields/defaults consistent.',
      );
    const target = prior ?? { data, students: [] };
    prepared.set(identity, target);
    for (const row of group.students) {
      let id = '';
      try {
        id = normalizeId(row.id);
      } catch {
        add('id', `File row ${row.sourceRow}: enter a valid student ID.`, row.key);
      }
      const name = row.name.trim();
      if (!name || name.length > 200)
        add(
          'name',
          `File row ${row.sourceRow}: student name is required (maximum 200 characters).`,
          row.key,
        );
      if (id) {
        const membership = JSON.stringify([identity, id]);
        if (enrollment.has(membership))
          add(
            'id',
            `File row ${row.sourceRow}: duplicate enrollment after ID normalization. Correct or remove the extra row.`,
            row.key,
          );
        enrollment.add(membership);
        const person = JSON.stringify([data.section, id]);
        if (name && names.has(person) && names.get(person) !== name)
          add(
            'name',
            `File row ${row.sourceRow}: ${id} already has name “${names.get(person)}”. Resolve this identity conflict.`,
            row.key,
          );
        else if (name) names.set(person, name);
      }
      target.students.push({ id, displayId: row.id.trim(), name, section: data.section });
    }
  }
  return { issues, classes: [...prepared.values()], total };
}
