import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2] ?? 'dist');
const manifest = JSON.parse(await readFile(path.join(root, '.vite/manifest.json'), 'utf8'));
function graph(entry, visited = new Set()) {
  if (visited.has(entry)) return visited;
  visited.add(entry);
  for (const child of manifest[entry].imports ?? []) graph(child, visited);
  return visited;
}
async function gzipBytes(keys) {
  let bytes = 0;
  for (const key of keys)
    bytes += gzipSync(await readFile(path.join(root, manifest[key].file))).byteLength;
  return bytes;
}
const student = graph('index.html');
// SW registration is dynamic but required by the initial application.
student.add('node_modules/workbox-window/build/workbox-window.prod.es5.mjs');
const teacher = graph('src/components/teacher/TeacherPortal.tsx');
for (const key of student) teacher.delete(key);
const studentBytes = await gzipBytes(student);
const teacherBytes = await gzipBytes(teacher);
const css = new Set(Object.values(manifest).flatMap((entry) => entry.css ?? []));
let cssBytes = 0;
for (const file of css) cssBytes += gzipSync(await readFile(path.join(root, file))).byteLength;
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
const checklist = JSON.parse(await readFile(path.join(root, 'offline-assets.json'), 'utf8'));
const files = new Set([...checklist, 'manifest.webmanifest', 'offline-assets.json']);
let precacheBytes = 0;
for (const file of files) {
  assert(worker.includes(file), `Required offline asset missing from worker manifest: ${file}`);
  precacheBytes += (await stat(path.join(root, file))).size;
}
assert(studentBytes <= 100 * 1024, 'Student initial graph exceeds 100 KiB gzip');
assert(teacherBytes <= 180 * 1024, 'Additional teacher graph exceeds 180 KiB gzip');
assert(cssBytes <= 10 * 1024, 'Styles exceed 10 KiB gzip');
assert(precacheBytes <= 2.5 * 1024 * 1024, 'Offline precache exceeds 2.5 MiB decoded');
console.log(
  JSON.stringify(
    {
      studentInitialGzipBytes: studentBytes,
      additionalTeacherGzipBytes: teacherBytes,
      cssGzipBytes: cssBytes,
      precacheDecodedBytes: precacheBytes,
      offlineAssets: files.size,
      limitsPassed: true,
    },
    null,
    2,
  ),
);
