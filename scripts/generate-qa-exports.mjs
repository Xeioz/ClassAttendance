import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? 'artifacts/qa-exports');
await mkdir(output, { recursive: true });
// Only SSR-load the export modules. Scanning index.html here would discover the
// application's virtual PWA import without its plugin and emit a misleading error.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});
try {
  const { buildExcelReport } = await server.ssrLoadModule('/src/utils/excel.ts');
  const { attendanceCSV } = await server.ssrLoadModule('/src/utils/csvExport.ts');
  const { exportFixture, verifyExport } = await server.ssrLoadModule(
    '/scripts/qa-export-contract.ts',
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
} finally {
  await server.close();
}
