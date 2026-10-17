export interface FieldObservation {
  participant_code: string;
  device: string;
  browser: string;
  condition: string;
  started_at: string;
  confirmed_at: string;
  class_started_at: string;
  attempts: string;
  unexpected_duplicate_alerts: string;
  decode_ms: string;
  wake_lock_supported: string;
  wake_lock_held: string;
}
function numeric(value: string, field: string, integer = false): number {
  if (!value.trim()) throw new Error(`Missing ${field}.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number)))
    throw new Error(`Invalid ${field}.`);
  return number;
}
function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
export function analyzeFieldRun(rows: FieldObservation[]) {
  if (!rows.length || rows.length > 10000)
    throw new Error('Supply 1–10,000 measured observations.');
  const seen = new Set<string>();
  let classStart: number | undefined;
  const decoded: number[] = [];
  const completed: number[] = [];
  let retries = 0;
  let duplicateAlerts = 0;
  let supportedWakeLock = 0;
  let heldWakeLock = 0;
  const conditions: Record<string, number> = {};
  const deviceBrowsers: Record<string, number> = {};
  const times = rows.map((row, index) => {
    for (const key of [
      'participant_code',
      'device',
      'browser',
      'condition',
      'started_at',
      'confirmed_at',
      'class_started_at',
      'attempts',
      'unexpected_duplicate_alerts',
      'decode_ms',
      'wake_lock_supported',
      'wake_lock_held',
    ] as const)
      if (typeof row[key] !== 'string') throw new Error(`Missing required column: ${key}.`);
    const name = row.participant_code?.trim();
    if (!name || seen.has(name))
      throw new Error(`Missing or duplicate participant code at row ${index + 2}.`);
    seen.add(name);
    if (!row.device?.trim() || !row.browser?.trim() || !row.condition?.trim())
      throw new Error(`Missing device, browser, or condition at row ${index + 2}.`);
    for (const value of [row.started_at, row.confirmed_at, row.class_started_at])
      if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
        throw new Error('Times must be ISO timestamps with an explicit timezone offset.');
    const start = Date.parse(row.started_at);
    const confirmed = Date.parse(row.confirmed_at);
    const runStart = Date.parse(row.class_started_at);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(confirmed) ||
      !Number.isFinite(runStart) ||
      confirmed < start ||
      start < runStart
    )
      throw new Error(`Invalid measured times at row ${index + 2}.`);
    if (classStart !== undefined && runStart !== classStart)
      throw new Error(
        'Each row must use the same class_started_at. Analyze separate runs separately.',
      );
    classStart = runStart;
    const attempts = numeric(row.attempts, 'attempts', true);
    if (attempts < 1) throw new Error('Each confirmed student needs at least one attempt.');
    retries += attempts - 1;
    duplicateAlerts += numeric(
      row.unexpected_duplicate_alerts,
      'unexpected_duplicate_alerts',
      true,
    );
    if (row.decode_ms.trim()) decoded.push(numeric(row.decode_ms, 'decode_ms'));
    if (
      !['yes', 'no', 'unsupported'].includes(row.wake_lock_supported) ||
      !['yes', 'no', 'not_tested'].includes(row.wake_lock_held)
    )
      throw new Error('Use the documented wake-lock values.');
    if (row.wake_lock_supported === 'yes' && row.wake_lock_held !== 'not_tested') {
      supportedWakeLock++;
      if (row.wake_lock_held === 'yes') heldWakeLock++;
    }
    conditions[row.condition] = (conditions[row.condition] ?? 0) + 1;
    const key = `${row.device} / ${row.browser}`;
    deviceBrowsers[key] = (deviceBrowsers[key] ?? 0) + 1;
    const elapsed = (confirmed - start) / 1000;
    completed.push(elapsed);
    return confirmed;
  });
  const totalSeconds = (Math.max(...times) - classStart!) / 1000;
  return {
    label: 'Measured field observations supplied by the operator; not independently verified',
    participants: rows.length,
    totalSeconds,
    secondsPerStudent: totalSeconds / rows.length,
    presentationToSaveSeconds: {
      median: percentile(completed, 0.5),
      p95: percentile(completed, 0.95),
    },
    firstReadRate: rows.filter((row) => Number(row.attempts) === 1).length / rows.length,
    retries,
    unexpectedDuplicateAlerts: duplicateAlerts,
    decodeLatencyMs: {
      measuredSamples: decoded.length,
      median: percentile(decoded, 0.5),
      p95: percentile(decoded, 0.95),
    },
    wakeLock: {
      testedSupported: supportedWakeLock,
      held: heldWakeLock,
      holdRate: supportedWakeLock ? heldWakeLock / supportedWakeLock : null,
    },
    conditions,
    deviceBrowsers,
    targets: {
      cohort45OrMore: rows.length >= 45,
      secondsPerStudentAtMost5: totalSeconds / rows.length <= 5,
      noUnexpectedDuplicateAlerts: duplicateAlerts === 0,
      decodeP95Below300: decoded.length ? percentile(decoded, 0.95)! < 300 : null,
    },
  };
}
