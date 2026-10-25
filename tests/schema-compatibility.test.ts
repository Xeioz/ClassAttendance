import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AttendanceDatabase } from '../src/db/db';

const core = {
  students: '&token, sectionToken',
  sessions: '&id, state',
  scanEvents: '&id, sessionId',
  attendance: '[sessionId+studentToken], sessionId',
  meta: '&id',
};
describe('native schema compatibility gate', () => {
  it('refuses an incomplete version-3 layout before Dexie can repair its stores', async () => {
    const name = `incomplete-v3-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores(core);
    await old.table('students').add({ token: 'keep', sectionToken: 'section', encrypted: { v: 1, iv: 'iv', data: 'cipher' } });
    old.close();
    const next = new AttendanceDatabase(name);
    await expect(next.open()).rejects.toThrow('Unrecognized');
    await old.open();
    expect((await old.table('students').get('keep')).encrypted.data).toBe('cipher');
    expect(old.tables.map(table => table.name).sort()).toEqual(Object.keys(core).sort());
    await old.delete();
  });
  for (const source of ['legacy', 'prototypev2', 'modernize'] as const) {
    it(`preserves every encrypted record from ${source} and reopens idempotently`, async () => {
      const name = `migration-${source}-${crypto.randomUUID()}`;
      const old = new Dexie(name);
      old
        .version(source === 'legacy' ? 1 : 2)
        .stores({
          ...core,
          ...(source === 'prototypev2'
            ? { classes: '&id', enrollments: '[classId+studentToken], classId, studentToken' }
            : source === 'modernize'
              ? { classTemplates: '&id' }
              : {}),
        });
      await old.open();
      const sentinel = {
        token: 'identity',
        sectionToken: 'section',
        encrypted: { v: 1, iv: 'keep', data: 'untouched' },
      };
      await old.table('students').add(sentinel);
      if (source !== 'legacy')
        await old
          .table(source === 'modernize' ? 'classTemplates' : 'classes')
          .add({ id: 'existing', encrypted: sentinel.encrypted });
      old.close();
      const upgraded = new AttendanceDatabase(name);
      await upgraded.open();
      expect(await upgraded.students.get('identity')).toEqual(sentinel);
      if (source !== 'legacy')
        expect(
          await upgraded
            .table(source === 'modernize' ? 'classTemplates' : 'classes')
            .get('existing'),
        ).toEqual({ id: 'existing', encrypted: sentinel.encrypted });
      expect(upgraded.tables.map((table) => table.name).sort()).toEqual(
        [...Object.keys(core), 'classes', 'enrollments', 'classTemplates', 'migrations'].sort(),
      );
      expect((await upgraded.migrations.get('schema-v3'))?.source).toBe(
        source === 'legacy' ? 'legacy-v1' : source,
      );
      upgraded.close();
      await upgraded.open();
      expect(await upgraded.students.get('identity')).toEqual(sentinel);
      await upgraded.delete();
    });
  }
  it('refuses an unknown store without deleting it', async () => {
    const name = `unknown-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({ ...core, unknownRecords: '&id' });
    await old.table('unknownRecords').add({ id: 'keep' });
    old.close();
    const next = new AttendanceDatabase(name);
    await expect(next.open()).rejects.toThrow('Unrecognized');
    await old.open();
    expect(await old.table('unknownRecords').get('keep')).toEqual({ id: 'keep' });
    await old.delete();
  });
  it('preserves modernize stores after Dexie adjusted native version 21', async () => {
    const name = `adjusted-${crypto.randomUUID()}`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 21);
      request.onupgradeneeded = () => {
        const database = request.result;
        const definitions = {
          students: ['token', 'sectionToken'],
          sessions: ['id', 'state'],
          scanEvents: ['id', 'sessionId'],
          attendance: [['sessionId', 'studentToken'], 'sessionId'],
          meta: ['id'],
          classTemplates: ['id'],
        };
        for (const [storeName, [keyPath, index]] of Object.entries(definitions)) {
          const store = database.createObjectStore(storeName, { keyPath });
          if (index) store.createIndex(index as string, index);
        }
        request
          .transaction!.objectStore('classTemplates')
          .add({ id: 'template', encrypted: { v: 1, iv: 'iv', data: 'cipher' } });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
    const next = new AttendanceDatabase(name);
    await next.open();
    expect((await next.classTemplates.get('template'))?.encrypted.data).toBe('cipher');
    await next.delete();
  });
});
