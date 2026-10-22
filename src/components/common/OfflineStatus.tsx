import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { errorMessage } from '../../utils/errors';
import { db } from '../../db/db';
import { t } from '../../i18n';
import {
  getOfflineEvidence,
  recordOfflineFailure,
  refreshOfflineEvidence,
  subscribeOfflineEvidence,
} from '../../domain/readiness';

export function OfflineStatus({ active }: { active: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const evidence = useSyncExternalStore(
    subscribeOfflineEvidence,
    getOfflineEvidence,
    getOfflineEvidence,
  );
  const [updateMessage, setUpdateMessage] = useState('');
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      recordOfflineFailure(
        t('readiness.offline.registrationFailed', { reason: errorMessage(error) }),
      );
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
  async function applyUpdate() {
    try {
      if (active || (await db.sessions.where('state').equals('ACTIVE').count()))
        throw new Error(t('readiness.offline.closeSession'));
      await updateServiceWorker(true);
    } catch (error) {
      setUpdateMessage(errorMessage(error));
    }
  }
  return (
    <aside className="mb-7 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>{t(online ? 'readiness.offline.online' : 'readiness.offline.offline')}</strong> ·{' '}
          {t(
            evidence.state === 'ready'
              ? 'readiness.offline.checked'
              : 'readiness.offline.notChecked',
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary"
            disabled={evidence.checking}
            onClick={() => {
              setUpdateMessage('');
              void refreshOfflineEvidence();
            }}
          >
            {t(evidence.checking ? 'readiness.refreshing' : 'readiness.offline.check')}
          </button>
          {needRefresh ? (
            <button
              type="button"
              className="secondary"
              disabled={active}
              onClick={() => void applyUpdate()}
            >
              {t(active ? 'readiness.offline.updateBlocked' : 'readiness.offline.update')}
            </button>
          ) : null}
        </div>
      </div>
      <p role="status" className="mt-2 text-xs text-slate-600">
        {updateMessage || evidence.message || t('readiness.offline.initial')}
      </p>
    </aside>
  );
}
