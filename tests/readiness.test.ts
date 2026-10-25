import { verifyOfflineResources } from '../src/utils/offline';
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBackupActivity,
  getOfflineEvidence,
  inspectOfflineResources,
  inspectStorage,
  recordBackupRequested,
  recordRestoreCompleted,
  refreshOfflineEvidence,
} from '../src/domain/readiness';

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock('../src/utils/offline', () => ({ verifyOfflineResources: vi.fn() }));
describe('offline readiness evidence', () => {
  it('does not infer readiness from the network when the active worker check fails', async () => {
    vi.mocked(verifyOfflineResources).mockRejectedValueOnce(
      new Error('Offline worker unavailable'),
    );
    await refreshOfflineEvidence();
    expect(getOfflineEvidence().state).toBe('attention');
    expect(getOfflineEvidence().message).toContain('Offline worker unavailable');
  });
  it('uses only the controlling worker resource verifier', async () => {
    vi.mocked(verifyOfflineResources).mockResolvedValueOnce(14);
    expect(await inspectOfflineResources()).toBe(14);
  });
  it('retains the cold-launch limitation after successful resource inspection', async () => {
    vi.mocked(verifyOfflineResources).mockResolvedValueOnce(14);
    await refreshOfflineEvidence();
    expect(getOfflineEvidence()).toMatchObject({
      state: 'ready',
      resourceCount: 14,
      checking: false,
    });
    expect(getOfflineEvidence().message).toMatch(/Test a cold offline launch/);
  });
  it('ignores an earlier success after a newer worker check failed', async () => {
    let finish!: (count: number) => void;
    vi.mocked(verifyOfflineResources)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('Current worker changed'));
    const pending = refreshOfflineEvidence();
    await refreshOfflineEvidence();
    finish(14);
    await pending;
    expect(getOfflineEvidence().state).toBe('attention');
    expect(getOfflineEvidence().message).toContain('Current worker changed');
  });
});

describe('storage and backup evidence', () => {
  it('queries storage without requesting persistence and retains partial failures', async () => {
    const persist = vi.fn();
    vi.stubGlobal('navigator', {
      storage: {
        persist,
        persisted: async () => false,
        estimate: async () => {
          throw new Error('unavailable');
        },
      },
    });
    expect(await inspectStorage()).toMatchObject({
      persisted: false,
      failed: true,
      supported: true,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not turn unsupported APIs or invalid estimates into usable capacity', async () => {
    vi.stubGlobal('navigator', {});
    expect(await inspectStorage()).toEqual({ supported: false, failed: false });
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: -1, quota: NaN }) } });
    expect(await inspectStorage()).toMatchObject({
      supported: true,
      usage: undefined,
      quota: undefined,
      persisted: undefined,
    });
  });

  it('keeps download requests and browser restores distinct and scoped to the observed vault', () => {
    const vault = `readiness-${Math.random()}`;
    expect(getBackupActivity(vault)).toEqual({});
    recordBackupRequested(vault, 100);
    expect(getBackupActivity(vault)).toEqual({ downloadRequestedAt: 100 });
    recordRestoreCompleted(vault, 200);
    expect(getBackupActivity(vault)).toEqual({ downloadRequestedAt: 100, restoreCompletedAt: 200 });
    expect(getBackupActivity(`${vault}-other`)).toEqual({});
    expect(getBackupActivity()).toEqual({});
  });
});
