import { describe, expect, it } from 'vitest';
import { analyzeFieldRun, type FieldObservation } from '../src/domain/fieldMetrics';
const row: FieldObservation = {
  participant_code: 'SYNTHETIC-1',
  device: 'Test camera',
  browser: 'Test browser',
  condition: 'A',
  started_at: '2026-10-17T00:00:00Z',
  confirmed_at: '2026-10-17T00:00:04Z',
  class_started_at: '2026-10-17T00:00:00Z',
  attempts: '1',
  unexpected_duplicate_alerts: '0',
  decode_ms: '',
  wake_lock_supported: 'unsupported',
  wake_lock_held: 'not_tested',
};
describe('field-analysis calculations (synthetic fixtures only)', () => {
  it('calculates measured cohort throughput and never invents unavailable latency or wake-lock results', () => {
    const result = analyzeFieldRun([
      row,
      {
        ...row,
        participant_code: 'SYNTHETIC-2',
        started_at: '2026-10-17T00:00:05Z',
        confirmed_at: '2026-10-17T00:00:10Z',
        attempts: '2',
      },
    ]);
    expect(result.totalSeconds).toBe(10);
    expect(result.secondsPerStudent).toBe(5);
    expect(result.firstReadRate).toBe(0.5);
    expect(result.retries).toBe(1);
    expect(result.decodeLatencyMs.p95).toBeNull();
    expect(result.wakeLock.holdRate).toBeNull();
    expect(result.targets.cohort45OrMore).toBe(false);
  });
  it('rejects blank observations, mixed runs, duplicate participants, and negative durations', () => {
    expect(() => analyzeFieldRun([])).toThrow();
    expect(() => analyzeFieldRun([{ ...row, started_at: '' }])).toThrow();
    expect(() => analyzeFieldRun([row, row])).toThrow('duplicate');
    expect(() => analyzeFieldRun([{ ...row, confirmed_at: '2026-10-16T00:00:00Z' }])).toThrow();
    expect(() =>
      analyzeFieldRun([
        row,
        { ...row, participant_code: 'X', class_started_at: '2026-10-16T00:00:00Z' },
      ]),
    ).toThrow('same class');
  });
});
