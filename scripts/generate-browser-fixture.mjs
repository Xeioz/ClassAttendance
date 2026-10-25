import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.resolve('vite'));
const { build } = require('esbuild');
await mkdir('.artifact-build', { recursive: true });
await mkdir('artifacts', { recursive: true });
const file = path.resolve('.artifact-build/browser-fixture.mjs');
await build({
  stdin: {
    contents: `
export { db } from './src/db/db';
export { unlockVault } from './src/db/vault';
export { encrypt } from './src/db/crypto';
export { createClass } from './src/domain/classes';
export { saveRoster, createSession, recordAttendance, closeSession } from './src/domain/attendance';
`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: file,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  logLevel: 'silent',
});
const {
  db,
  unlockVault,
  encrypt,
  createClass,
  saveRoster,
  createSession,
  recordAttendance,
  closeSession,
} = await import(pathToFileURL(file).href);
// fake-indexeddb keeps all fixture generation in memory, separate from browser records.
const keys = await unlockVault('104928573612');
const settings = {
  course: 'IT301',
  section: 'BSIT-3A',
  term: '2026–27 / Semester 1',
  subject: 'Web Systems',
  institution: 'Synthetic QA campus',
  room: 'Lab 2',
  timezone: 'Asia/Manila',
  graceMinutes: 15,
};
const offering = await createClass(keys, settings);
const students = Array.from({ length: 20 }, (_, i) => ({
  id: `CA${202304427 + i}`,
  name: `Sample Student ${String(i + 1).padStart(2, '0')}`,
  section: settings.section,
}));
await saveRoster(keys, students, offering.id);
const startsAt = Date.now();
const session = await createSession(keys, {
  ...settings,
  classId: offering.id,
  roomPin: '482193',
  startsAt,
});
await recordAttendance(
  keys,
  session.id,
  { student: session.roster[0], reason: 'Synthetic browser fixture' },
  startsAt,
);
await closeSession(keys, session);
const payload = await db.transaction('r', db.tables, async () => ({
  students: await db.students.toArray(),
  sessions: await db.sessions.toArray(),
  attendance: await db.attendance.toArray(),
  scanEvents: await db.scanEvents.toArray(),
  classes: await db.classes.toArray(),
  enrollments: await db.enrollments.toArray(),
}));
await writeFile(
  'artifacts/browser-prototypev2.enc.json',
  JSON.stringify({
    format: 'attendance-desk',
    v: 2,
    meta: await db.meta.get('vault'),
    payload: await encrypt(keys.encryption, payload, 'backup:v2'),
  }),
);
await writeFile(
  'artifacts/browser-master-list.csv',
  '\uFEFFid,name,section\r\n' +
    students.map((student) => `${student.id},${student.name},${student.section}`).join('\r\n'),
);
db.close();
console.log(
  'Created synthetic prototypev2 backup and 20-student master list in artifacts/. Test PIN: 104928573612.',
);
