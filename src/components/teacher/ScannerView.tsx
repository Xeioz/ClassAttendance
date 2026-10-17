import { useEffect, useId, useRef, useState } from 'react';
import { ScanDebounce } from '../../domain/qr';
import { startCamera, type CameraHandle } from '../../utils/camera';
import { errorMessage } from '../../utils/errors';

export function ScannerView({
  onScan,
  onPending,
}: {
  onScan: (value: string) => Promise<void>;
  onPending: (pending: boolean) => void;
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
    if (!running) return;
    let disposed = false;
    const debounce = new ScanDebounce();
    async function read(raw: string) {
      if (disposed || processing.current) return;
      let identity = raw;
      try {
        const value = JSON.parse(raw) as { id?: unknown };
        if (typeof value.id === 'string') identity = value.id;
      } catch {
        /* Validation reports malformed codes. */
      }
      if (!debounce.accept(identity, performance.now())) return;
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
          setError(
            `Camera unavailable: ${errorMessage(error)}. Manual check-in is available below.`,
          );
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
  }, [running, device, fallback, hostId]);
  async function toggleTorch() {
    try {
      await camera.current?.torch(!torch);
      setTorch((value) => !value);
    } catch {
      setError('Torch is not available on this camera/browser.');
    }
  }
  return (
    <section aria-label="QR camera scanner" className="grid gap-4">
      <div id={hostId} className="min-h-48 overflow-hidden rounded-xl bg-slate-950" />
      <div className="flex flex-wrap gap-3">
        <button
          className={running ? 'secondary' : 'btn'}
          onClick={() => {
            setError('');
            setRunning((value) => !value);
          }}
        >
          {running ? 'Stop camera' : 'Start camera'}
        </button>
        {running && hasTorch ? (
          <button className="secondary" aria-pressed={torch} onClick={() => void toggleTorch()}>
            Torch {torch ? 'off' : 'on'}
          </button>
        ) : null}
      </div>
      {devices.length > 1 ? (
        <label>
          Camera
          <select
            disabled={running}
            value={device}
            onChange={(event) => setDevice(event.target.value)}
          >
            <option value="">Automatic rear camera</option>
            {devices.map((item, index) => (
              <option key={item.deviceId} value={item.deviceId}>
                {item.label || `Camera ${index + 1}`}
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
        Use compatibility decoder
      </label>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
    </section>
  );
}
