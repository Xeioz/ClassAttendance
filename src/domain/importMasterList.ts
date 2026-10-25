import Dexie from 'dexie';
import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import type {
  ClassPrivate,
  ClassRow,
  StudentPrivate,
  StudentRow,
  Student,
  ClassOffering,
  VaultKeys,
} from '../types';
import {
  classIdentity,
  personIdentity,
  inspectMasterDraft,
  type MasterClassDraft,
  type NameApprovals,
} from './masterListDraft';
import { teacherOperation } from './operations';

export async function readImportSnapshot(keys: VaultKeys) {
  const snapshot = await db.transaction('r', [db.meta, db.classes, db.students], async () => {
    if ((await db.meta.get('vault'))?.salt !== keys.salt)
      throw new Error('Vault changed. Unlock again.');
    return { classes: await db.classes.toArray(), students: await db.students.toArray() };
  });
  const students: Student[] = await Promise.all(
    snapshot.students.map(async (row) => ({
      token: row.token,
      ...(await decrypt<StudentPrivate>(keys.encryption, row.encrypted, `student:${row.token}`)),
    })),
  );
  const classes: ClassOffering[] = await Promise.all(
    snapshot.classes.map(async (row) => ({
      id: row.id,
      ...(await decrypt<ClassPrivate>(keys.encryption, row.encrypted, `class:${row.id}`)),
    })),
  );
  return { students, classes, fingerprint: JSON.stringify(snapshot) };
}

export const importMasterList = teacherOperation(
  async (
    keys: VaultKeys,
    draft: MasterClassDraft[],
    options: { expectedSnapshot?: string; approvals?: NameApprovals } = {},
  ) => {
    const validation = inspectMasterDraft(draft);
    if (validation.issues.length) throw new Error(validation.issues[0].message);
    const snapshot = await db.classes.toArray();
    const offerings = await Promise.all(
      snapshot.map(async (row) => ({
        id: row.id,
        ...(await decrypt<ClassPrivate>(keys.encryption, row.encrypted, `class:${row.id}`)),
      })),
    );
    const classes = new Map(offerings.map((offering) => [classIdentity(offering), offering.id]));
    if (classes.size !== offerings.length)
      throw new Error('Existing class identities conflict. Resolve them before importing.');
    const added: ClassRow[] = [];
    const students = new Map<string, { row: StudentRow; data: StudentPrivate }>();
    const memberships: Array<{ classId: string; studentToken: string }> = [];
    const classIds: string[] = [];
    for (const group of validation.classes) {
      const identity = classIdentity(group.data);
      let classId = classes.get(identity);
      if (!classId) {
        classId = crypto.randomUUID();
        classes.set(identity, classId);
        added.push({
          id: classId,
          encrypted: await encrypt(keys.encryption, group.data, `class:${classId}`),
        });
      }
      classIds.push(classId);
      for (const data of group.students) {
        const token = await privateToken(keys, `student:${data.section}:${data.id}`);
        if (!students.has(token))
          students.set(token, {
            data,
            row: {
              token,
              sectionToken: await privateToken(keys, `section:${data.section}`),
              encrypted: await encrypt(keys.encryption, data, `student:${token}`),
            },
          });
        memberships.push({ classId, studentToken: token });
      }
    }
    let addedEnrollments = 0;
    await db.transaction(
      'rw',
      [db.meta, db.classes, db.students, db.enrollments, db.sessions],
      async () => {
        if ((await db.meta.get('vault'))?.salt !== keys.salt)
          throw new Error('Vault changed. Unlock again.');
        if (await db.sessions.where('state').equals('ACTIVE').count())
          throw new Error('Close the active session before importing a master list.');
        if (JSON.stringify(await db.classes.toArray()) !== JSON.stringify(snapshot))
          throw new Error('Classes changed in another tab. Review and retry the import.');
        if (
          options.expectedSnapshot !== undefined &&
          JSON.stringify({
            classes: await db.classes.toArray(),
            students: await db.students.toArray(),
          }) !== options.expectedSnapshot
        )
          throw new Error(
            'Master list changed in another tab. Review the refreshed preview and approve changes again.',
          );
        const changedStudents: StudentRow[] = [];
        const entries = [...students.values()];
        const priorStudents = await db.students.bulkGet(entries.map((item) => item.row.token));
        for (const [index, { row, data }] of entries.entries()) {
          const prior = priorStudents[index];
          if (prior) {
            const value = await Dexie.waitFor(
              decrypt<StudentPrivate>(keys.encryption, prior.encrypted, `student:${row.token}`),
            );
            const approval = options.approvals?.[personIdentity(data.section, data.id)];
            if (
              value.name !== data.name &&
              (approval?.before !== value.name || approval?.after !== data.name)
            )
              throw new Error(
                `Name conflict for ${data.id}: existing name is ${value.name}. Correct the preview and retry.`,
              );
            if (
              value.name !== data.name ||
              (value.displayId ?? value.id) !== (data.displayId ?? data.id)
            )
              changedStudents.push(row);
          } else changedStudents.push(row);
        }
        await db.classes.bulkAdd(added);
        await db.students.bulkPut(changedStudents);
        const currentMemberships = await db.enrollments.bulkGet(
          memberships.map((item) => [item.classId, item.studentToken] as [string, string]),
        );
        const additions = memberships.filter((_, index) => !currentMemberships[index]);
        addedEnrollments = additions.length;
        await db.enrollments.bulkAdd(additions);
      },
    );
    return {
      classIds,
      createdClasses: added.length,
      matchedClasses: classIds.length - added.length,
      enrollmentRows: memberships.length,
      addedEnrollments,
      students: students.size,
    };
  },
);

export type MasterImportResult = Awaited<ReturnType<typeof importMasterList>>;
