import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
await mkdir('.artifact-build', { recursive: true });
await mkdir('artifacts', { recursive: true });
const modulePath = path.resolve('.artifact-build/benchmark-data.mjs');
await build({
  stdin: {
    contents: `
export { db } from './src/db/db';
export { unlockVault } from './src/db/vault';
export { importMasterList } from './src/domain/importMasterList';
export { groupMasterRows } from './src/domain/masterListDraft';
export { createSession, recordAttendance } from './src/domain/attendance';
`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: modulePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  logLevel: 'silent',
});
const { db, unlockVault, importMasterList, groupMasterRows, createSession, recordAttendance } =
  await import(pathToFileURL(modulePath).href);
const results = [];
for (const count of [100, 1000, 10000]) {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  const keys = await unlockVault('104928573612');
  const draft = groupMasterRows(
    Array.from({ length: count }, (_, index) => ({
      id: `CA${String(index).padStart(10, '0')}`,
      name: `Synthetic Student ${index}`,
      section: 'A',
      course: 'QA101',
      term: '2026 / 1',
      subject: '',
      institution: '',
      room: '',
      sourceRow: index + 2,
    })),
  );
  const started = performance.now();
  const imported = await importMasterList(keys, draft);
  const importMs = performance.now() - started;
  assert.equal(await db.enrollments.count(), count);
  const sessionStarted = performance.now();
  const session = await createSession(keys, {
    classId: imported.classIds[0],
    course: 'QA101',
    section: 'A',
    roomPin: '492',
    startsAt: Date.now(),
    graceMinutes: 15,
  });
  const sessionMs = performance.now() - sessionStarted;
  const saves = [];
  for (const student of session.roster.slice(0, 5)) {
    const started = performance.now();
    const result = await recordAttendance(keys, session.id, {
      raw: JSON.stringify({ v: 1, id: student.id, ch: '492', ts: Math.floor(Date.now() / 1000) }),
    });
    assert.equal(result.kind, 'valid');
    saves.push(performance.now() - started);
  }
  results.push({
    students: count,
    importMs,
    sessionMs,
    committedScanMs: saves,
    heapUsedAfterScans: process.memoryUsage().heapUsed,
  });
}
db.close();
const report = {
  node: process.version,
  platform: process.platform,
  synthetic: true,
  scope:
    'One Node run using in-memory fake-indexeddb. Includes real WebCrypto and domain transactions; excludes file parsing, browser rendering, physical storage, camera and chimes. Heap values are samples, not peak measurements or device benchmarks.',
  results,
};
await writeFile('artifacts/offline-data-benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
