/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};
const manifest = self.__WB_MANIFEST;
const sw = self;
precacheAndRoute(manifest);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));
sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
  if (event.data?.type === 'CHECK_OFFLINE') {
    // This worker checks its own revision-specific precache, never another build's cache.
    event.waitUntil(
      Promise.all(
        manifest.map((entry) => matchPrecache(typeof entry === 'string' ? entry : entry.url)),
      )
        .then((responses) =>
          event.ports[0]?.postMessage({ ready: responses.every(Boolean), count: responses.length }),
        )
        .catch(() => event.ports[0]?.postMessage({ ready: false })),
    );
  }
});
