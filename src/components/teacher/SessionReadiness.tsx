import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ClassSettings, Session } from '../../types';
import { t } from '../../i18n';
import { validateClassSettings } from '../../domain/classSettings';
import {
  getBackupActivity,
  getOfflineEvidence,
  inspectStorage,
  refreshOfflineEvidence,
  subscribeBackupActivity,
  subscribeOfflineEvidence,
  type ReadinessState,
  type StorageEvidence,
} from '../../domain/readiness';
import { errorMessage } from '../../utils/errors';

export interface ReadinessConfiguration extends Partial<ClassSettings> {
  startsAt?: number;
  roomPin?: string;
}

type CameraPermission = PermissionState | 'unknown' | 'unavailable';
type CameraTest = { state: 'untested' | 'testing' | 'passed' | 'failed'; reason?: string };

function focusTarget(id: string) {
  document.getElementById(id)?.focus();
}

function checkedTime(time: number, timezone?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(time);
  } catch {
    return new Date(time).toLocaleString();
  }
}

function ReadinessItem({
  title,
  state,
  required,
  children,
}: {
  title: string;
  state: ReadinessState;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <li className="rounded-lg border border-slate-300 bg-white p-4" aria-labelledby={id}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 id={id} className="font-semibold">
          {title}
        </h4>
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${state === 'ready' ? 'bg-emerald-100 text-emerald-950' : state === 'attention' ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'}`}
        >
          {t(`readiness.state.${state}`)}
        </span>
      </div>
      <p className="mb-2 text-xs font-semibold text-slate-600">
        {t(required ? 'readiness.required' : 'readiness.recommended')}
      </p>
      <div className="space-y-2 text-sm text-slate-700">{children}</div>
    </li>
  );
}

export function SessionReadiness({
  config,
  rosterCount,
  rosterIssues = 0,
  rosterReviewPending = false,
  activeSession,
  configurationErrors = [],
  onReviewConfiguration,
  onReviewRoster,
  onReviewActiveSession,
  vaultId,
}: {
  config: ReadinessConfiguration;
  rosterCount: number;
  rosterIssues?: number;
  rosterReviewPending?: boolean;
  activeSession?: Session;
  configurationErrors?: string[];
  onReviewConfiguration?: () => void;
  onReviewRoster?: () => void;
  onReviewActiveSession?: () => void;
  vaultId?: string;
}) {
  const titleId = useId();
  const cameraDescriptionId = useId();
  const offline = useSyncExternalStore(
    subscribeOfflineEvidence,
    getOfflineEvidence,
    getOfflineEvidence,
  );
  const backup = useSyncExternalStore(
    subscribeBackupActivity,
    () => getBackupActivity(vaultId),
    () => getBackupActivity(vaultId),
  );
  const [permission, setPermission] = useState<CameraPermission>('unknown');
  const [cameraCount, setCameraCount] = useState<number>();
  const [cameraTest, setCameraTest] = useState<CameraTest>({ state: 'untested' });
  const [storage, setStorage] = useState<StorageEvidence>();
  const [safeCheckVersion, setSafeCheckVersion] = useState(0);
  const [safeChecking, setSafeChecking] = useState(false);
  const mounted = useRef(false);
  const cameraRequest = useRef(0);
  const cameraStream = useRef<MediaStream | undefined>(undefined);
  const contextKey = JSON.stringify([
    config,
    rosterCount,
    rosterIssues,
    rosterReviewPending,
    activeSession?.id,
    vaultId,
  ]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cameraRequest.current++;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = undefined;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cameraQuery = cameraRequest.current;
    let permissionResult: PermissionStatus | undefined;
    let onPermissionChange: (() => void) | undefined;
    setSafeChecking(true);
    void refreshOfflineEvidence();
    async function checkPermission() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setPermission('unavailable');
          setCameraCount(undefined);
        }
        return;
      }
      let state: CameraPermission = 'unknown';
      try {
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (cancelled) return;
          permissionResult = result;
          state = result.state;
          onPermissionChange = () => {
            if (cancelled) return;
            setPermission(result.state);
            if (result.state !== 'granted') setCameraTest({ state: 'untested' });
            setSafeCheckVersion((version) => version + 1);
          };
          result.addEventListener?.('change', onPermissionChange);
        }
      } catch {
        /* Permission querying is not supported by every camera-capable browser. */
      }
      let count: number | undefined;
      try {
        if (navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices.filter((device) => device.kind === 'videoinput').length;
          // A hidden list before permission does not establish absent hardware.
          if (cameras > 0 || state === 'granted') count = cameras;
        }
      } catch {
        /* Device enumeration is advisory; keep unavailable information unknown. */
      }
      if (!cancelled && cameraQuery === cameraRequest.current) {
        setPermission(state);
        setCameraCount(count);
      }
    }
    void Promise.all([
      checkPermission(),
      inspectStorage().then((result) => {
        if (!cancelled) setStorage(result);
      }),
    ]).finally(() => {
      if (!cancelled) setSafeChecking(false);
    });
    return () => {
      cancelled = true;
      if (onPermissionChange) permissionResult?.removeEventListener?.('change', onPermissionChange);
    };
  }, [contextKey, safeCheckVersion]);

  async function testCamera() {
    if (!navigator.mediaDevices?.getUserMedia || cameraTest.state === 'testing') return;
    const request = ++cameraRequest.current;
    setCameraTest({ state: 'testing' });
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!mounted.current || request !== cameraRequest.current) return;
      cameraStream.current = stream;
      if (!stream.getVideoTracks().some((track) => track.readyState === 'live'))
        throw new Error(t('readiness.camera.noTrack'));
      setCameraTest({ state: 'passed' });
      setSafeCheckVersion((version) => version + 1);
    } catch (error) {
      if (!mounted.current || request !== cameraRequest.current) return;
      const name =
        error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
          ? error.name
          : '';
      const reason =
        name === 'NotAllowedError'
          ? t('readiness.camera.noPermission')
          : name === 'NotFoundError'
            ? t('readiness.camera.noDevice')
            : name === 'NotReadableError'
              ? t('readiness.camera.busy')
              : errorMessage(error);
      setCameraTest({ state: 'failed', reason });
      if (name === 'NotAllowedError') setPermission('denied');
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (cameraStream.current === stream) cameraStream.current = undefined;
    }
  }

  let configError = configurationErrors[0];
  try {
    validateClassSettings(config);
  } catch (error) {
    configError ||= errorMessage(error);
  }
  if (
    !Number.isFinite(config.startsAt) ||
    !Number.isFinite(new Date(config.startsAt ?? NaN).getTime()) ||
    !/^\d{3,6}$/.test(config.roomPin ?? '')
  )
    configError ||= t('readiness.configuration.incomplete');
  const configReady = !configError;
  const rosterReady = rosterCount > 0 && rosterIssues === 0 && !rosterReviewPending;
  const hasActiveSession = activeSession?.state === 'ACTIVE';
  const blockers = Number(!configReady) + Number(!rosterReady) + Number(hasActiveSession);
  const cameraState: ReadinessState =
    permission === 'unavailable'
      ? 'notApplicable'
      : permission === 'denied' || cameraCount === 0 || cameraTest.state === 'failed'
        ? 'attention'
        : cameraTest.state === 'passed'
          ? 'ready'
          : 'notChecked';
  const storageNearLimit =
    storage?.usage !== undefined &&
    storage.quota !== undefined &&
    storage.usage / storage.quota >= 0.9;
  const storageState: ReadinessState = !storage
    ? 'notChecked'
    : !storage.supported
      ? 'notApplicable'
      : storageNearLimit || storage.persisted === false
        ? 'attention'
        : storage.persisted === true &&
            storage.usage !== undefined &&
            storage.quota !== undefined &&
            !storage.failed
          ? 'ready'
          : 'notChecked';
  const cameraMessage =
    cameraTest.state === 'passed'
      ? t('readiness.camera.passed')
      : cameraTest.state === 'failed'
        ? t('readiness.camera.failed', { reason: cameraTest.reason ?? '' })
        : cameraTest.state === 'testing'
          ? t('readiness.camera.testing')
          : t('readiness.camera.notTested');

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-slate-300 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} className="text-lg font-semibold">
          {t('readiness.title')}
        </h3>
        <button
          type="button"
          className="secondary"
          disabled={safeChecking}
          onClick={() => setSafeCheckVersion((version) => version + 1)}
        >
          {t(safeChecking ? 'readiness.refreshing' : 'readiness.refresh')}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-700">{t('readiness.intro')}</p>
      <p role="status" aria-live="polite" aria-atomic="true" className="my-3 font-medium">
        {t(blockers ? 'readiness.summary.blocked' : 'readiness.summary.ready', { count: blockers })}
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        <ReadinessItem
          title={t('readiness.configuration.title')}
          state={configReady ? 'ready' : 'attention'}
          required
        >
          <p>
            {t('readiness.configuration.summary', {
              course: config.course || t('readiness.configuration.noValue'),
              section: config.section || t('readiness.configuration.noValue'),
              room: config.room || t('readiness.configuration.noRoom'),
              startsAt: Number.isFinite(config.startsAt)
                ? checkedTime(config.startsAt!, config.timezone)
                : t('readiness.configuration.noTime'),
              grace: config.graceMinutes ?? t('readiness.configuration.noValue'),
              timezone: config.timezone || t('readiness.configuration.noValue'),
            })}
          </p>
          {configError ? <p>{configError}</p> : null}
          <button
            type="button"
            className="secondary"
            onClick={
              onReviewConfiguration ??
              ((event) =>
                event.currentTarget
                  .closest('form')
                  ?.querySelector<HTMLInputElement>('input:not([disabled])')
                  ?.focus())
            }
          >
            {t('readiness.configuration.review')}
          </button>
        </ReadinessItem>
        <ReadinessItem
          title={t('readiness.roster.title')}
          state={rosterReady ? 'ready' : 'attention'}
          required
        >
          <p>{t('readiness.roster.count', { count: rosterCount })}</p>
          {rosterCount === 0 ? <p>{t('readiness.roster.empty')}</p> : null}
          {rosterIssues > 0 ? <p>{t('readiness.roster.issues', { count: rosterIssues })}</p> : null}
          {rosterReviewPending ? <p>{t('readiness.roster.pending')}</p> : null}
          <button
            type="button"
            className="secondary"
            onClick={onReviewRoster ?? (() => focusTarget('roster-import-file'))}
          >
            {t('readiness.roster.review')}
          </button>
        </ReadinessItem>
        <ReadinessItem
          title={t('readiness.session.title')}
          state={hasActiveSession ? 'attention' : 'ready'}
          required
        >
          <p>
            {hasActiveSession
              ? t('readiness.session.blocked', {
                  course: activeSession.course,
                  section: activeSession.section,
                })
              : t('readiness.session.clear')}
          </p>
          {hasActiveSession ? (
            <button
              type="button"
              className="secondary"
              onClick={onReviewActiveSession ?? (() => focusTarget('active-session'))}
            >
              {t('readiness.session.review')}
            </button>
          ) : null}
        </ReadinessItem>
        <ReadinessItem title={t('readiness.camera.title')} state={cameraState}>
          <div id={cameraDescriptionId}>
            <p>{t(`readiness.camera.permission.${permission}`)}</p>
            <p>
              {cameraCount === undefined
                ? t('readiness.camera.devicesUnknown')
                : t('readiness.camera.devices', { count: cameraCount })}
            </p>
          </div>
          <p role="status" aria-live="polite" aria-atomic="true">
            {cameraMessage}
          </p>
          <button
            type="button"
            className="secondary"
            aria-describedby={cameraDescriptionId}
            disabled={permission === 'unavailable' || cameraTest.state === 'testing'}
            onClick={() => void testCamera()}
          >
            {t(
              cameraTest.state === 'testing' ? 'readiness.camera.testing' : 'readiness.camera.test',
            )}
          </button>
        </ReadinessItem>
        <ReadinessItem title={t('readiness.offline.title')} state={offline.state}>
          <p>{offline.message || t('readiness.offline.initial')}</p>
          <button
            type="button"
            className="secondary"
            disabled={offline.checking}
            onClick={() => void refreshOfflineEvidence()}
          >
            {t(offline.checking ? 'readiness.refreshing' : 'readiness.offline.check')}
          </button>
        </ReadinessItem>
        <ReadinessItem title={t('readiness.storage.title')} state={storageState}>
          {!storage ? (
            <p>{t('readiness.storage.unknown')}</p>
          ) : !storage.supported ? (
            <p>{t('readiness.storage.unsupported')}</p>
          ) : (
            <>
              <p>
                {t(
                  storage.persisted === true
                    ? 'readiness.storage.persisted'
                    : storage.persisted === false
                      ? 'readiness.storage.notPersisted'
                      : 'readiness.storage.persistenceUnknown',
                )}
              </p>
              <p>
                {storage.usage !== undefined && storage.quota !== undefined
                  ? t('readiness.storage.estimate', {
                      used: (storage.usage / 1048576).toFixed(1),
                      quota: (storage.quota / 1048576).toFixed(1),
                    })
                  : t('readiness.storage.estimateUnknown')}
              </p>
              {storageNearLimit ? <p>{t('readiness.storage.nearLimit')}</p> : null}
              {storage.failed ? <p>{t('readiness.storage.failed')}</p> : null}
            </>
          )}
        </ReadinessItem>
        <ReadinessItem title={t('readiness.activity.title')} state="notChecked">
          <p>{t('readiness.activity.pageOnly')}</p>
          <p>
            {backup.downloadRequestedAt
              ? t('readiness.activity.requested', {
                  time: checkedTime(backup.downloadRequestedAt, config.timezone),
                })
              : t('readiness.activity.noDownload')}
          </p>
          <p>
            {backup.restoreCompletedAt
              ? t('readiness.activity.restored', {
                  time: checkedTime(backup.restoreCompletedAt, config.timezone),
                })
              : t('readiness.activity.noRestore')}
          </p>
          <p>{t('readiness.activity.recoveryUnknown')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              focusTarget(
                document.getElementById('backup-download') ? 'backup-download' : 'backup-controls',
              )
            }
          >
            {t('readiness.activity.review')}
          </button>
        </ReadinessItem>
      </ul>
      <p className="mt-3 text-xs text-slate-600">{t('readiness.transient')}</p>
    </section>
  );
}
