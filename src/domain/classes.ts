import Dexie from 'dexie';
import { db } from '../db/db';
import { decrypt, encrypt } from '../db/crypto';
import { sectionKey } from '../utils/normalize';
import { teacherOperation } from './operations';
import type { ClassOffering, ClassPrivate, SessionPrivate, VaultKeys } from '../types';

export async function listClasses(keys: VaultKeys): Promise<ClassOffering[]> {
  return Promise.all(
    (await db.classes.toArray()).map(async (row) => ({
      id: row.id,
      ...(await decrypt<ClassPrivate>(keys.encryption, row.encrypted, `class:${row.id}`)),
    })),
  );
}
export const createClass = teacherOperation(async (keys: VaultKeys, input: ClassPrivate) => {
  const data = {
    ...input,
    course: input.course.trim(),
    section: sectionKey(input.section),
    term: input.term.trim() || 'Unspecified term',
  };
  if (
    !data.course ||
    !data.section ||
    Object.values(data).some((value) => typeof value === 'string' && value.length > 150) ||
    !Number.isInteger(data.graceMinutes) ||
    data.graceMinutes < 0 ||
    data.graceMinutes > 180
  )
    throw new Error('Enter a course, section and valid defaults (0–180 minute grace).');
  if (data.timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: data.timezone });
    } catch {
      throw new Error('Invalid timezone.');
    }
  }
  const id = crypto.randomUUID();
  const encrypted = await encrypt(keys.encryption, data, `class:${id}`);
  await db.transaction('rw', [db.classes, db.meta], async () => {
    if ((await db.meta.get('vault'))?.salt !== keys.salt)
      throw new Error('Vault changed. Unlock again.');
    const existing = await Dexie.waitFor(listClasses(keys));
    if (
      existing.some(
        (item) =>
          item.course.toLowerCase() === data.course.toLowerCase() &&
          item.section === data.section &&
          item.term.toLowerCase() === data.term.toLowerCase(),
      )
    )
      throw new Error(
        'This course, section and term already exists. Choose that class or enter a different term.',
      );
    await db.classes.add({ id, encrypted });
  });
  return { id, ...data };
});

// Association is explicit and idempotent. No historical roster or identity is rewritten.
export const associateLegacySession = teacherOperation(
  async (keys: VaultKeys, sessionId: string, classId: string) => {
    const offering = (await listClasses(keys)).find((item) => item.id === classId);
    if (!offering) throw new Error('Choose an existing class.');
    const stored = await db.sessions.get(sessionId);
    if (!stored) throw new Error('Session not found.');
    const session = await decrypt<SessionPrivate>(
      keys.encryption,
      stored.encrypted,
      `session:${sessionId}`,
    );
    if (session.classId && session.classId !== classId)
      throw new Error('This session already belongs to another class.');
    if (session.course !== offering.course || session.section !== offering.section)
      throw new Error('Course and section must match. Create the matching class first.');
    const encrypted = await encrypt(
      keys.encryption,
      { ...session, classId },
      `session:${sessionId}`,
    );
    await db.transaction('rw', [db.meta, db.classes, db.sessions], async () => {
      if ((await db.meta.get('vault'))?.salt !== keys.salt || !(await db.classes.get(classId)))
        throw new Error('Workspace changed. Unlock again.');
      if (JSON.stringify(await db.sessions.get(sessionId)) !== JSON.stringify(stored))
        throw new Error('Session changed. Retry.');
      await db.sessions.update(sessionId, { encrypted });
    });
  },
);

export const copyLegacyEnrollment = teacherOperation(async (keys: VaultKeys, classId: string) => {
  const offering = (await listClasses(keys)).find((item) => item.id === classId);
  if (!offering) throw new Error('Class not found.');
  const students = await db.students.toArray();
  const matching: string[] = [];
  for (const row of students) {
    const value = await decrypt<{ section: string }>(
      keys.encryption,
      row.encrypted,
      `student:${row.token}`,
    );
    if (value.section === offering.section) matching.push(row.token);
  }
  if (!matching.length)
    throw new Error('No existing students match this section. Import a CSV instead.');
  await db.transaction(
    'rw',
    [db.meta, db.students, db.sessions, db.classes, db.enrollments],
    async () => {
      if ((await db.meta.get('vault'))?.salt !== keys.salt || !(await db.classes.get(classId)))
        throw new Error('Workspace changed.');
      if (await db.sessions.where('state').equals('ACTIVE').count())
        throw new Error('Close the active session before changing enrollment.');
      // Preserve the set of enrolled students even if this review is repeated.
      await db.enrollments.bulkPut(matching.map((studentToken) => ({ classId, studentToken })));
    },
  );
});

export async function classStudents(keys: VaultKeys, classId: string) {
  const memberships = await db.enrollments.where('classId').equals(classId).toArray();
  const rows = await db.students.bulkGet(memberships.map((item) => item.studentToken));
  if (rows.some((row) => !row))
    throw new Error('Class enrollment is incomplete. Restore a verified backup.');
  return Promise.all(
    rows.map(async (row) => ({
      token: row!.token,
      ...(await decrypt<import('../types').StudentPrivate>(
        keys.encryption,
        row!.encrypted,
        `student:${row!.token}`,
      )),
    })),
  );
}

export const updateClassDefaults = teacherOperation(
  async (keys: VaultKeys, id: string, input: ClassPrivate) => {
    const row = await db.classes.get(id);
    if (!row) throw new Error('Class not found.');
    const existing = await decrypt<ClassPrivate>(keys.encryption, row.encrypted, `class:${id}`);
    const data = {
      ...existing,
      subject: input.subject.trim(),
      institution: input.institution.trim(),
      room: input.room.trim(),
      graceMinutes: input.graceMinutes,
      timezone: input.timezone,
    };
    if (
      ![data.subject, data.institution, data.room].every((value) => value.length <= 150) ||
      !Number.isInteger(data.graceMinutes) ||
      data.graceMinutes < 0 ||
      data.graceMinutes > 180
    )
      throw new Error('Invalid class defaults.');
    if (data.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: data.timezone });
      } catch {
        throw new Error('Invalid timezone.');
      }
    }
    const encrypted = await encrypt(keys.encryption, data, `class:${id}`);
    await db.transaction('rw', [db.meta, db.classes], async () => {
      if (
        (await db.meta.get('vault'))?.salt !== keys.salt ||
        JSON.stringify(await db.classes.get(id)) !== JSON.stringify(row)
      )
        throw new Error('Class changed. Refresh and retry.');
      await db.classes.update(id, { encrypted });
    });
  },
);
