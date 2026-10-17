import fs from 'node:fs/promises';
import Papa from 'papaparse';
import { analyzeFieldRun, type FieldObservation } from '../src/domain/fieldMetrics.ts';

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: pnpm field:analyze measured.csv [summary.json]');
  const parsed = Papa.parse<FieldObservation>(await fs.readFile(input, 'utf8'), {
    header: true,
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  const summary = JSON.stringify(analyzeFieldRun(parsed.data), null, 2) + '\n';
  if (process.argv[3]) await fs.writeFile(process.argv[3], summary);
  else process.stdout.write(summary);
}
void main().catch((error) => {
  console.error(
    `Field analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
