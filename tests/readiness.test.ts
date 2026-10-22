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

function cachedWebsite(files: unknown = ['index.html', 'assets/app.js'], missing?: string) {
  vi.stubGlobal('navigator', {
    onLine: true,
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue({ active: {}, scope: `${location.origin}/` }),
    },
  });
  const match = vi.fn(async (url: URL, options: { ignoreSearch: boolean }) => {
    expect(options.ignoreSearch).toBe(true);
    if (url.pathname.endsWith('offline-assets.json')) return new Response(JSON.stringify(files));
    if (url.pathname.endsWith(missing ?? '!none')) return undefined;
    return new Response('cached content');
  });
  vi.stubGlobal('caches', { match });
  return match;
}

describe('offline readiness evidence', () => {
  it('does not infer cache readiness from an online connection', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await refreshOfflineEvidence();
    expect(getOfflineEvidence().state).toBe('attention');
    expect(getOfflineEvidence().message).toMatch(/does not support offline/);
  });

  it('requires an active worker in the app scope', async () => {
    cachedWebsite();
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
      active: {},
      scope: `${location.origin}/elsewhere/`,
    } as ServiceWorkerRegistration);
    await expect(inspectOfflineResources()).rejects.toThrow(/not active/);
  });

  it.each(
    [
      [],
      ['index.html'],
      ['index.html', '../foreign.js'],
      ['index.html', 'https://example.com/app.js'],
      ['index.html', 23],
    ].map((files) => ({ files })),
  )('rejects incomplete or invalid checklists: $files', async ({ files }) => {
    cachedWebsite(files);
    await expect(inspectOfflineResources()).rejects.toThrow(/checklist.*invalid/);
  });

  it('requires every successful cached resource response, including JavaScript', async () => {
    cachedWebsite(undefined, 'app.js');
    await expect(inspectOfflineResources()).rejects.toThrow(/not cached/);
    const match = cachedWebsite();
    match.mockImplementation(async (url) =>
      url.pathname.endsWith('offline-assets.json')
        ? new Response(JSON.stringify(['index.html', 'assets/app.js']))
        : new Response('unavailable', { status: 404 }),
    );
    await expect(inspectOfflineResources()).rejects.toThrow(/not cached/);
  });

  it('reports observed cache contents while retaining the cold-launch limitation', async () => {
    cachedWebsite();
    await refreshOfflineEvidence();
    expect(getOfflineEvidence()).toMatchObject({
      state: 'ready',
      resourceCount: 2,
      checking: false,
    });
    expect(getOfflineEvidence().message).toMatch(/Test a cold offline launch/);
  });

  it('ignores an older cache check that finishes after a newer failure', async () => {
    let finish!: (registration: ServiceWorkerRegistration) => void;
    cachedWebsite();
    vi.mocked(navigator.serviceWorker.getRegistration).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = refreshOfflineEvidence();
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(undefined);
    await refreshOfflineEvidence();
    finish({ active: {}, scope: `${location.origin}/` } as ServiceWorkerRegistration);
    await first;
    expect(getOfflineEvidence().state).toBe('attention');
    expect(getOfflineEvidence().message).toMatch(/not active/);
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
