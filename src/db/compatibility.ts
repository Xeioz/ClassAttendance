/** Upgrade native stores before Dexie can apply its same-version schema repair. */
export const STORE_SCHEMA = {
  students: { key: 'token', indexes: { sectionToken: 'sectionToken' } },
  sessions: { key: 'id', indexes: { state: 'state' } },
  scanEvents: { key: 'id', indexes: { sessionId: 'sessionId' } },
  attendance: { key: ['sessionId', 'studentToken'], indexes: { sessionId: 'sessionId' } },
  meta: { key: 'id', indexes: {} },
  classes: { key: 'id', indexes: {} },
  enrollments: {
    key: ['classId', 'studentToken'],
    indexes: { classId: 'classId', studentToken: 'studentToken' },
  },
  classTemplates: { key: 'id', indexes: {} },
  migrations: { key: 'id', indexes: {} },
} as const;
const core = ['students', 'sessions', 'scanEvents', 'attendance', 'meta'];

function inspect(
  database: IDBDatabase,
  existingTransaction?: IDBTransaction,
  version = database.version,
): string {
  const names = Array.from(database.objectStoreNames);
  const matches = (extra: string[]) =>
    names.length === core.length + extra.length &&
    [...core, ...extra].every((name) => names.includes(name));
  const source = matches([])
    ? 'legacy-v1'
    : matches(['classes', 'enrollments'])
      ? 'prototypev2'
      : matches(['classTemplates'])
        ? 'modernize'
        : matches(['classes', 'enrollments', 'classTemplates', 'migrations'])
          ? 'unified-v3'
          : '';
  if (
    !source ||
    ![10, 20, 21, 30].includes(version) ||
    (version === 30) !== (source === 'unified-v3')
  )
    throw new Error(
      'Unrecognized attendance database. No records were changed. Export a backup with the original version before continuing.',
    );
  const transaction = existingTransaction ?? database.transaction(names, 'readonly');
  for (const name of names) {
    const expected = STORE_SCHEMA[name as keyof typeof STORE_SCHEMA];
    const store = transaction.objectStore(name);
    if (
      store.autoIncrement ||
      JSON.stringify(store.keyPath) !== JSON.stringify(expected.key) ||
      store.indexNames.length !== Object.keys(expected.indexes).length
    )
      throw new Error('Unrecognized database keys. No records were changed.');
    for (const [indexName, keyPath] of Object.entries(expected.indexes)) {
      const index = store.index(indexName);
      if (index.unique || index.multiEntry || index.keyPath !== keyPath)
        throw new Error('Unrecognized database indexes. No records were changed.');
    }
  }
  return source;
}

export async function prepareDatabase(name: string): Promise<void> {
  const source = await new Promise<string>((resolve, reject) => {
    const request = indexedDB.open(name);
    let fresh = false;
    request.onupgradeneeded = () => {
      fresh = true;
      request.transaction!.abort(); // Inspection never creates an empty legacy database.
      request.result.close();
    };
    request.onerror = () => (fresh ? resolve('fresh') : reject(request.error));
    request.onsuccess = () => {
      try {
        resolve(inspect(request.result));
      } catch (error) {
        reject(error);
      } finally {
        request.result.close();
      }
    };
  });
  if (source === 'unified-v3') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 30); // Dexie schema 3 uses native version 30.
    request.onblocked = () => {
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('attendance:database-blocked'));
    };
    request.onupgradeneeded = (event) => {
      const database = request.result;
      let actualSource = source;
      try {
        if (event.oldVersion)
          actualSource = inspect(database, request.transaction!, event.oldVersion);
      } catch {
        request.transaction!.abort();
        database.close();
        return;
      }
      // Add missing stores only. Existing ciphertext, IDs, snapshots and indexes are untouched.
      for (const [name, schema] of Object.entries(STORE_SCHEMA)) {
        if (database.objectStoreNames.contains(name)) continue;
        const store = database.createObjectStore(name, {
          keyPath: typeof schema.key === 'string' ? schema.key : [...schema.key],
        });
        for (const [index, path] of Object.entries(schema.indexes)) store.createIndex(index, path);
      }
      request
        .transaction!.objectStore('migrations')
        .put({ id: 'schema-v3', source: actualSource, version: 3 });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        inspect(request.result);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        request.result.close();
      }
    };
  });
}
