import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? 'artifacts/qa-exports');
await mkdir(output, { recursive: true });
// Bundle only export modules for Node. This avoids opening a development server
// or importing the browser application/PWA entry while generating synthetic reports.
const buildDirectory = path.resolve('.artifact-build');
await mkdir(buildDirectory, { recursive: true });
const modulePath = path.join(buildDirectory, 'qa-export-modules.mjs');
const require = createRequire(import.meta.resolve('vite'));
const { build } = require('esbuild');
await build({
  stdin: {
    contents:
      "export { buildExcelReport } from './src/utils/excel'; export { attendanceCSV } from './src/utils/csvExport'; export { exportFixture, verifyExport } from './scripts/qa-export-contract';",
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
const { buildExcelReport, attendanceCSV, exportFixture, verifyExport } = await import(
  pathToFileURL(modulePath).href
);
const results = [];
for (const size of [0, 1, 45, 10000]) {
  const fixture = exportFixture(size);
  const started = performance.now();
  const bytes = await buildExcelReport(fixture.session, fixture.attendance, fixture.audit);
  const xlsxGenerationMs = performance.now() - started;
  const csvStarted = performance.now();
  const csv = attendanceCSV(fixture.session, fixture.attendance);
  const csvGenerationMs = performance.now() - csvStarted;
  const verified = await verifyExport(bytes, csv, fixture);
  await writeFile(path.join(output, `attendance-${size}.xlsx`), new Uint8Array(bytes));
  await writeFile(path.join(output, `attendance-${size}.csv`), csv);
  await writeFile(path.join(output, `expected-${size}.json`), JSON.stringify(fixture.expected));
  results.push({
    ...verified,
    xlsxBytes: bytes.byteLength,
    csvBytes: Buffer.byteLength(csv),
    xlsxGenerationMs,
    csvGenerationMs,
  });
}
const report = {
  node: process.version,
  platform: process.platform,
  syntheticData: true,
  timingScope:
    'One run per size: serialization only; excludes database reads, browser download and validation; no performance acceptance target.',
  results,
};
await writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
