import type { QRPayload } from '../types';
import { normalizeId } from '../utils/normalize';

export function parseQR(raw: string, challenge: string, now = Date.now()): QRPayload {
  if (raw.length > 512) throw new Error('QR payload is too large.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('This is not an attendance QR code.');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid QR payload.');
  const p = value as Record<string, unknown>;
  if (
    p.v !== 1 ||
    typeof p.id !== 'string' ||
    typeof p.ch !== 'string' ||
    typeof p.ts !== 'number' ||
    !Number.isSafeInteger(p.ts)
  )
    throw new Error('Unsupported QR payload.');
  const id = normalizeId(p.id);
  if (p.ch !== challenge)
    throw new Error('Wrong room challenge. Ask the student to update their pass.');
  const age = Math.floor(now / 1000) - p.ts;
  if (age < -30 || age > 90)
    throw new Error(
      'Pass expired or device clock differs. Refresh the pass or use manual check-in.',
    );
  return { v: 1, id, ch: p.ch, ts: p.ts };
}
export function punctuality(
  now: number,
  startsAt: number,
  graceMinutes: number,
): 'PRESENT' | 'LATE' {
  return now <= startsAt + graceMinutes * 60_000 ? 'PRESENT' : 'LATE';
}
export class ScanDebounce {
  private last = '';
  private at = -Infinity;
  accept(id: string, now: number): boolean {
    // Suppress identical consecutive frames for 1.5 seconds; database handles real duplicates.
    if (id === this.last && now - this.at < 1500) return false;
    this.last = id;
    this.at = now;
    return true;
  }
}

export class ContinuousScanGate {
  private cooldown = new ScanDebounce();
  private id = '';
  private seen = -Infinity;
  accept(id: string, now: number, busy = false): boolean {
    const held = id === this.id && now - this.seen < 650;
    if (id === this.id) this.seen = now;
    // Continuous visibility stays suppressed beyond 1.5s. A deliberate rescan needs a gap.
    if (held || busy || !this.cooldown.accept(id, now)) return false;
    this.id = id;
    this.seen = now;
    return true;
  }
}
