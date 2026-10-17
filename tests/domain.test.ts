import { describe, expect, it } from 'vitest';
import { parseQR, punctuality, ScanDebounce, ContinuousScanGate } from '../src/domain/qr';
import { readRoster } from '../src/utils/csv';
import { normalizeId } from '../src/utils/normalize';

describe('QR and ID contracts', () => {
  const now = 1_800_000_000_000;
  const qr = (override: object = {}) =>
    JSON.stringify({ v: 1, id: '2024-10492', ch: '492', ts: now / 1000, ...override });
  it('normalizes IDs while retaining leading zeros', () => {
    expect(normalizeId('0024-001')).toBe('0024001');
    expect(parseQR(qr(), '492', now).id).toBe('202410492');
    expect(() => normalizeId('<script>')).toThrow();
  });
  it('rejects wrong session, bad JSON, old/future timestamps and unsupported versions', () => {
    for (const raw of [
      qr({ ch: '123' }),
      qr({ ts: now / 1000 - 91 }),
      qr({ ts: now / 1000 + 31 }),
      qr({ v: 2 }),
      qr({ ts: '123' }),
      'null',
      'bad json',
      'a'.repeat(513),
    ])
      expect(() => parseQR(raw, '492', now)).toThrow();
  });
  it('defines punctuality exactly at the grace boundary', () => {
    expect(punctuality(now + 900000, now, 15)).toBe('PRESENT');
    expect(punctuality(now + 900001, now, 15)).toBe('LATE');
  });
  it('debounces consecutive identical IDs for exactly 1.5 seconds', () => {
    const debounce = new ScanDebounce();
    expect(debounce.accept('A', 0)).toBe(true);
    expect(debounce.accept('A', 1499)).toBe(false);
    expect(debounce.accept('A', 1500)).toBe(true);
    expect(debounce.accept('B', 1501)).toBe(true);
    expect(debounce.accept('A', 1502)).toBe(true);
  });
});
describe('CSV ingestion', () => {
  it('handles UTF-8 BOM, quoted commas and Philippine names', async () => {
    const file = new File(
      ['\uFEFFid,name,section\r\n0024-001,"Peña, José Niño",BSIT-3A'],
      'roster.csv',
    );
    const { rows, encoding } = await readRoster(file, 'auto');
    expect(rows).toEqual([
      { id: '0024001', displayId: '0024-001', name: 'Peña, José Niño', section: 'BSIT-3A' },
    ]);
    expect(encoding).toBe('utf-8');
  });
  it('falls back to Windows-1252 with a preview warning', async () => {
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('id,name,section\n1,Pe'),
      0xf1,
      ...new TextEncoder().encode('a,A'),
    ]);
    const result = await readRoster(new File([bytes], 'roster.csv'), 'auto');
    expect(result.rows[0].name).toBe('Peña');
    expect(result.encoding).toContain('fallback');
  });
  it('blocks normalization collisions and missing headers', async () => {
    await expect(
      readRoster(new File(['id,name,section\nAB-12,A,X\nA-B12,B,X'], 'r.csv'), 'auto'),
    ).rejects.toThrow('collision');
    await expect(readRoster(new File(['id,name\n1,A'], 'r.csv'), 'auto')).rejects.toThrow(
      'headers',
    );
  });
});
describe('continuous camera target suppression', () => {
  it('records a continuously held target once, then allows a deliberate re-presentation', () => {
    const gate = new ContinuousScanGate();
    let accepted = 0;
    for (let time = 0; time <= 5000; time += 100) if (gate.accept('A', time)) accepted++;
    expect(accepted).toBe(1);
    expect(gate.accept('A', 5800)).toBe(true);
    expect(gate.accept('B', 5900)).toBe(true);
  });
  it('does not consume the next student while a write is pending', () => {
    const gate = new ContinuousScanGate();
    expect(gate.accept('A', 0)).toBe(true);
    expect(gate.accept('B', 100, true)).toBe(false);
    expect(gate.accept('B', 200)).toBe(true);
  });
});
