import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { errorMessage } from '../../utils/errors';
import { db } from '../../db/db';

export function OfflineStatus({ active }: { active: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('Offline resources have not been verified.');
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      setMessage(`Offline caching unavailable: ${errorMessage(error)}`);
    },
  });
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  async function check() {
    try {
      if (!('serviceWorker' in navigator) || !('caches' in window))
        throw new Error('This browser does not support offline website storage.');
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw new Error(
          'Offline cache is not active. Use the production build, wait for caching, and reload.',
        );
      // Workbox adds revision query parameters to precache keys.
      const response = await caches.match(new URL('offline-assets.json', document.baseURI), {
        ignoreSearch: true,
      });
      if (!response) throw new Error('Offline asset checklist is not cached yet.');
      const files = (await response.json()) as string[];
      const matches = await Promise.all(
        files.map((file) => caches.match(new URL(file, document.baseURI), { ignoreSearch: true })),
      );
      if (!matches.every(Boolean))
        throw new Error(
          'Some required resources are not cached. Reconnect and refresh before class.',
        );
      setVerified(true);
      setMessage(
        'Required website resources cached. Test a cold offline launch before class. Browser data can still be cleared.',
      );
    } catch (error) {
      setVerified(false);
      setMessage(errorMessage(error));
    }
  }
  async function applyUpdate() {
    try {
      if (active || (await db.sessions.where('state').equals('ACTIVE').count()))
        throw new Error('Close the active attendance session before applying a website update.');
      await updateServiceWorker(true);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <aside className="mb-7 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>{online ? 'Network available' : 'Offline'}</strong> ·{' '}
          {verified ? 'Cache checked' : 'Cache not checked'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="secondary" onClick={() => void check()}>
            Check offline readiness
          </button>
          {needRefresh ? (
            <button className="secondary" disabled={active} onClick={() => void applyUpdate()}>
              {active ? 'Update waits for session closure' : 'Apply website update'}
            </button>
          ) : null}
        </div>
      </div>
      <p role="status" className="mt-2 text-xs text-slate-600">
        {message}
      </p>
    </aside>
  );
}
