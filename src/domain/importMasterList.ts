import Dexie from 'dexie';
import { db } from '../db/db';
import { decrypt, encrypt, privateToken } from '../db/crypto';
import type { ClassPrivate, ClassRow, StudentPrivate, StudentRow, VaultKeys } from '../types';
import { classIdentity, inspectMasterDraft, type MasterClassDraft } from './masterListDraft';
import { teacherOperation } from './operations';

export const importMasterList = teacherOperation(
  async (keys: VaultKeys, draft: MasterClassDraft[]) => {
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
        for (const { row, data } of students.values()) {
          const prior = await db.students.get(row.token);
          if (prior) {
            const value = await Dexie.waitFor(
              decrypt<StudentPrivate>(keys.encryption, prior.encrypted, `student:${row.token}`),
            );
            if (value.name !== data.name)
              throw new Error(
                `Name conflict for ${data.id}: existing name is ${value.name}. Correct the preview and retry.`,
              );
          }
        }
        await db.classes.bulkAdd(added);
        await db.students.bulkPut([...students.values()].map((student) => student.row));
        for (const membership of memberships) {
          if (!(await db.enrollments.get([membership.classId, membership.studentToken])))
            addedEnrollments++;
          await db.enrollments.put(membership);
        }
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
