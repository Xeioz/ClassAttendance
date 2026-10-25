import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { errorMessage } from '../../utils/errors';
import { db, requestPersistence } from '../../db/db';
import { teacherOperation } from '../../domain/operations';

export function OfflineStatus({ active, student = false }: { active: boolean; student?: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(
    'Prepare this browser while connected before using it offline.',
  );
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
    const invalidate = () => {
      setVerified(false);
      setMessage('Website version changed. Check offline readiness again.');
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    navigator.serviceWorker?.addEventListener('controllerchange', invalidate);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      navigator.serviceWorker?.removeEventListener('controllerchange', invalidate);
    };
  }, []);
  async function check() {
    setChecking(true);
    try {
      const controller = navigator.serviceWorker?.controller;
      if (!controller)
        throw new Error(
          'Offline worker is not controlling this page yet. Wait for preparation, then reload the production website and retry.',
        );
      const ready = await new Promise<boolean>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
          channel.port1.close();
          reject(new Error('Offline check timed out. Reconnect and retry.'));
        }, 10000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(event.data?.ready === true);
        };
        controller.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
      });
      if (!ready || controller !== navigator.serviceWorker.controller)
        throw new Error(
          'Required resources are incomplete or the website changed. Reconnect and retry.',
        );
      const persistence = await requestPersistence();
      setVerified(true);
      setMessage(
        `Current website resources verified. Test reopening your saved link without a connection. ${persistence}`,
      );
    } catch (error) {
      setVerified(false);
      setMessage(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }
  async function applyUpdate() {
    try {
      if (student)
        throw new Error(
          'After attendance, close all Attendance Desk tabs and reopen your saved student link to allow the update.',
        );
      await teacherOperation(async () => {
        if (active || (await db.sessions.where('state').equals('ACTIVE').count()))
          throw new Error('Close the active attendance session before updating.');
        await updateServiceWorker(true);
      })();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  return (
    <aside className="mb-6 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>{online ? 'Network available' : 'Offline'}</strong> ·{' '}
          {verified ? 'Resources verified' : 'Preparation not verified'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="secondary" disabled={checking} onClick={() => void check()}>
            {checking
              ? 'Checking resources…'
              : student
                ? 'Prepare for offline use'
                : 'Check offline readiness'}
          </button>
          {needRefresh && (
            <button className="secondary" disabled={active} onClick={() => void applyUpdate()}>
              {active ? 'Update deferred' : 'Website update available'}
            </button>
          )}
        </div>
      </div>
      <p role="status" className="mt-2 text-xs text-slate-600">
        {message}
      </p>
      {student && (
        <div className="mt-3">
          <label>
            Save this student link
            <input
              readOnly
              value={`${location.origin}${import.meta.env.BASE_URL}#/student`}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <p className="mt-2 text-xs text-slate-600">
            Bookmark this exact link to bypass role selection. A home-screen icon may still open the
            role page. Saving a link alone does not prepare offline resources.
          </p>
        </div>
      )}
    </aside>
  );
}
