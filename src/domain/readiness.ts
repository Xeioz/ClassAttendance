import { t } from '../i18n';
import { errorMessage } from '../utils/errors';

export type ReadinessState = 'ready' | 'attention' | 'notChecked' | 'notApplicable';

export interface OfflineEvidence {
  state: ReadinessState;
  checking: boolean;
  message: string;
  checkedAt?: number;
  resourceCount?: number;
}

let offlineEvidence: OfflineEvidence = {
  state: 'notChecked',
  checking: false,
  message: '',
};
const offlineListeners = new Set<() => void>();
let offlineRequest = 0;
export const getOfflineEvidence = () => offlineEvidence;
export function subscribeOfflineEvidence(listener: () => void) {
  offlineListeners.add(listener);
  return () => {
    offlineListeners.delete(listener);
  };
}
function setOfflineEvidence(next: OfflineEvidence) {
  offlineEvidence = next;
  offlineListeners.forEach((listener) => listener());
}

/** Read cached responses, never infer offline support from network availability. */
export async function inspectOfflineResources(): Promise<number> {
  if (!navigator.serviceWorker || typeof caches === 'undefined')
    throw new Error(t('readiness.offline.unsupported'));
  const registration = await navigator.serviceWorker.getRegistration();
  const resourceBase = new URL(import.meta.env.BASE_URL || '/', location.href);
  if (!registration?.active || !resourceBase.href.startsWith(registration.scope))
    throw new Error(t('readiness.offline.inactive'));
  const response = await caches.match(new URL('offline-assets.json', resourceBase), {
    ignoreSearch: true,
  });
  if (!response?.ok) throw new Error(t('readiness.offline.noChecklist'));
  const files: unknown = await response.json();
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every(
      (file) =>
        typeof file === 'string' &&
        file.length > 0 &&
        !file.startsWith('/') &&
        !file.split('/').includes('..'),
    ) ||
    !files.some((file: string) => file === 'index.html') ||
    !files.some((file: string) => /\.js$/.test(file))
  )
    throw new Error(t('readiness.offline.invalidChecklist'));
  const urls = (files as string[]).map((file) => new URL(file, resourceBase));
  if (
    urls.some(
      (url) =>
        url.origin !== resourceBase.origin || !url.pathname.startsWith(resourceBase.pathname),
    )
  )
    throw new Error(t('readiness.offline.invalidChecklist'));
  const matches = await Promise.all(urls.map((url) => caches.match(url, { ignoreSearch: true })));
  if (!matches.every((match) => match?.ok)) throw new Error(t('readiness.offline.missing'));
  return urls.length;
}

export async function refreshOfflineEvidence() {
  const request = ++offlineRequest;
  setOfflineEvidence({ ...offlineEvidence, checking: true });
  try {
    const resourceCount = await inspectOfflineResources();
    if (request !== offlineRequest) return;
    setOfflineEvidence({
      state: 'ready',
      checking: false,
      checkedAt: Date.now(),
      resourceCount,
      message: t('readiness.offline.cached'),
    });
  } catch (error) {
    if (request !== offlineRequest) return;
    setOfflineEvidence({
      state: 'attention',
      checking: false,
      checkedAt: Date.now(),
      message: errorMessage(error),
    });
  }
}

export function recordOfflineFailure(message: string) {
  offlineRequest++;
  setOfflineEvidence({ state: 'attention', checking: false, message });
}

export interface StorageEvidence {
  persisted?: boolean;
  usage?: number;
  quota?: number;
  supported: boolean;
  failed: boolean;
}

/** Passive queries only: requesting persistence is a separate, explicit user action. */
export async function inspectStorage(): Promise<StorageEvidence> {
  const storage = navigator.storage;
  if (!storage) return { supported: false, failed: false };
  const [persisted, estimate] = await Promise.allSettled([
    Promise.resolve().then(() =>
      typeof storage.persisted === 'function' ? storage.persisted() : undefined,
    ),
    Promise.resolve().then(() =>
      typeof storage.estimate === 'function' ? storage.estimate() : undefined,
    ),
  ]);
  const value = estimate.status === 'fulfilled' ? estimate.value : undefined;
  return {
    supported: typeof storage.persisted === 'function' || typeof storage.estimate === 'function',
    failed: persisted.status === 'rejected' || estimate.status === 'rejected',
    persisted: persisted.status === 'fulfilled' ? persisted.value : undefined,
    usage:
      typeof value?.usage === 'number' && Number.isFinite(value.usage) && value.usage >= 0
        ? value.usage
        : undefined,
    quota:
      typeof value?.quota === 'number' && Number.isFinite(value.quota) && value.quota > 0
        ? value.quota
        : undefined,
  };
}

export interface BackupActivity {
  downloadRequestedAt?: number;
  restoreCompletedAt?: number;
}
const noBackupActivity: BackupActivity = Object.freeze({});
const backupActivity = new Map<string, BackupActivity>();
const backupListeners = new Set<() => void>();
export function getBackupActivity(vaultId?: string): BackupActivity {
  return vaultId ? (backupActivity.get(vaultId) ?? noBackupActivity) : noBackupActivity;
}
export function subscribeBackupActivity(listener: () => void) {
  backupListeners.add(listener);
  return () => {
    backupListeners.delete(listener);
  };
}
/** Activity is deliberately memory-only, scoped to this page and this vault. */
export function recordBackupRequested(vaultId: string, at = Date.now()) {
  backupActivity.set(vaultId, { ...getBackupActivity(vaultId), downloadRequestedAt: at });
  backupListeners.forEach((listener) => listener());
}
export function recordRestoreCompleted(vaultId: string, at = Date.now()) {
  backupActivity.set(vaultId, { ...getBackupActivity(vaultId), restoreCompletedAt: at });
  backupListeners.forEach((listener) => listener());
}
