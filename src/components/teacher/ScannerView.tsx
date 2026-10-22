import { useEffect, useId, useRef, useState } from 'react';
import { ContinuousScanGate } from '../../domain/qr';
import { startCamera, type CameraHandle } from '../../utils/camera';
import { errorMessage } from '../../utils/errors';
import { t } from '../../i18n';

export function ScannerView({
  onScan,
  onPending,
  paused = false,
}: {
  onScan: (value: string) => Promise<void>;
  onPending: (pending: boolean) => void;
  paused?: boolean;
}) {
  const hostId = `camera-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [running, setRunning] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [device, setDevice] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);
  const camera = useRef<CameraHandle | undefined>(undefined);
  const latestScan = useRef(onScan);
  latestScan.current = onScan;
  const latestPending = useRef(onPending);
  latestPending.current = onPending;
  const processing = useRef(false);
  const stopPromise = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!running || paused) return;
    let disposed = false;
    const debounce = new ContinuousScanGate();
    async function read(raw: string) {
      if (disposed) return;
      let identity = raw;
      try {
        const value = JSON.parse(raw) as { id?: unknown };
        if (typeof value.id === 'string') identity = value.id;
      } catch {
        /* Validation reports malformed codes. */
      }
      if (!debounce.accept(identity, performance.now(), processing.current)) return;
      processing.current = true;
      latestPending.current(true);
      try {
        await latestScan.current(raw);
      } catch (error) {
        if (!disposed) setError(errorMessage(error));
      } finally {
        processing.current = false;
        latestPending.current(false);
      }
    }
    async function start() {
      await stopPromise.current;
      if (disposed) return;
      try {
        const handle = await startCamera(
          hostId,
          (raw) => void read(raw),
          (message) => {
            if (!disposed) {
              setError(message);
              setRunning(false);
            }
          },
          device || undefined,
          fallback,
        );
        if (disposed) {
          await handle.stop();
          return;
        }
        camera.current = handle;
        setHasTorch(handle.hasTorch);
        setTorch(false);
        const available = await navigator.mediaDevices.enumerateDevices();
        if (!disposed) setDevices(available.filter((item) => item.kind === 'videoinput'));
      } catch (error) {
        if (!disposed) {
          setError(t('scanner.unavailable', { error: errorMessage(error) }));
          setRunning(false);
        }
      }
    }
    const startPromise = start();
    return () => {
      disposed = true;
      const handle = camera.current;
      camera.current = undefined;
      // Await startup too: permission prompts may resolve after the component unmounts.
      stopPromise.current = startPromise.then(() => handle?.stop()).catch(() => {});
    };
  }, [running, device, fallback, hostId, paused]);
  async function toggleTorch() {
    try {
      await camera.current?.torch(!torch);
      setTorch((value) => !value);
    } catch {
      setError(t('scanner.torchUnavailable'));
    }
  }
  return (
    <section aria-label={t('scanner.label')} className="grid gap-4">
      <div id={hostId} className="min-h-48 overflow-hidden rounded-xl bg-slate-950" />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={paused}
          aria-describedby={paused ? `${hostId}-paused` : error ? `${hostId}-error` : undefined}
          className={running ? 'secondary' : 'btn'}
          onClick={() => {
            setError('');
            setRunning((value) => !value);
          }}
        >
          {running ? t('scanner.stop') : t('scanner.start')}
        </button>
        {running && !paused && hasTorch ? (
          <button
            type="button"
            className="secondary"
            aria-pressed={torch}
            onClick={() => void toggleTorch()}
          >
            {torch ? t('scanner.torchOff') : t('scanner.torchOn')}
          </button>
        ) : null}
      </div>
      {paused ? (
        <p id={`${hostId}-paused`} className="text-sm">
          {t('scanner.paused')}
        </p>
      ) : null}
      {devices.length > 1 ? (
        <label>
          {t('scanner.camera')}
          <select
            disabled={running}
            value={device}
            onChange={(event) => setDevice(event.target.value)}
          >
            <option value="">{t('scanner.automatic')}</option>
            {devices.map((item, index) => (
              <option key={item.deviceId} value={item.deviceId}>
                {item.label || t('scanner.number', { number: index + 1 })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex min-h-12 items-center gap-3 font-normal">
        <input
          type="checkbox"
          className="h-6 min-h-0 w-6"
          checked={fallback}
          disabled={running}
          onChange={(event) => setFallback(event.target.checked)}
        />
        {t('scanner.compatibility')}
      </label>
      {error ? (
        <p id={`${hostId}-error`} role="alert" className="notice">
          {error}
        </p>
      ) : null}
    </section>
  );
}
