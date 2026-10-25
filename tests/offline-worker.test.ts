import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const cache = vi.hoisted(() => ({ match: vi.fn(), precache: vi.fn(), cleanup: vi.fn() }));
vi.mock('workbox-precaching', () => ({
  matchPrecache: cache.match,
  precacheAndRoute: cache.precache,
  cleanupOutdatedCaches: cache.cleanup,
  createHandlerBoundToURL: vi.fn(() => () => {}),
}));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), NavigationRoute: class {} }));
interface WorkerMessage {
  data: { type: string };
  ports: Array<{ postMessage: (value: unknown) => void }>;
  waitUntil: (task: Promise<unknown>) => void;
}
afterEach(() => vi.unstubAllGlobals());
describe('controlling worker offline verification', () => {
  let listeners: Record<string, (event: WorkerMessage) => void>;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    listeners = {};
    vi.stubGlobal('self', {
      __WB_MANIFEST: [
        { url: 'index.html', revision: 'build-v2' },
        { url: 'assets/decoder.js', revision: 'decoder-v2' },
      ],
      addEventListener: (name: string, handler: (event: WorkerMessage) => void) => {
        listeners[name] = handler;
      },
    });
    await import('../src/sw');
  });
  async function check() {
    const postMessage = vi.fn();
    let operation!: Promise<unknown>;
    listeners.message({
      data: { type: 'CHECK_OFFLINE' },
      ports: [{ postMessage }],
      waitUntil: (task: Promise<unknown>) => {
        operation = task;
      },
    });
    await operation;
    return postMessage.mock.calls[0][0] as { ready: boolean; count?: number };
  }
  it('asks Workbox for each exact manifest resource rather than matching across all caches', async () => {
    cache.match.mockResolvedValue(new Response('cached'));
    expect(await check()).toEqual({ ready: true, count: 2 });
    expect(cache.match.mock.calls.map((args) => args[0])).toEqual([
      'index.html',
      'assets/decoder.js',
    ]);
  });
  it('rejects readiness when a decoder chunk is absent or storage lookup fails', async () => {
    cache.match.mockImplementation((url: string) =>
      Promise.resolve(url === 'index.html' ? new Response('cached') : undefined),
    );
    expect((await check()).ready).toBe(false);
    cache.match.mockRejectedValue(new Error('Storage unavailable'));
    expect((await check()).ready).toBe(false);
  });
});
