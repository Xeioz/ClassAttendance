import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useWakeLock } from '../../hooks/wakeLock';
import { errorMessage } from '../../utils/errors';

export function DynamicQR({ id, challenge }: { id: string; challenge: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const lockStatus = useWakeLock(true);
  const epoch = Math.floor(now / 30000) * 30;
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    let cancelled = false;
    // A 30-second token is freshness feedback, not proof of identity or screenshot protection.
    void QRCode.toCanvas(canvas.current, JSON.stringify({ v: 1, id, ch: challenge, ts: epoch }), {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(() => {
        if (!cancelled) setError('');
      })
      .catch((error) => {
        if (!cancelled) setError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [id, challenge, epoch]);
  return (
    <div className="grid justify-items-center gap-4">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Attendance pass for student ${id}`}
        className="rounded-xl border border-slate-200"
      />
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
      <div className="text-center">
        <p className="text-xl font-semibold tracking-wider">{id}</p>
        <p className="text-sm text-slate-600">
          Room challenge {challenge} · Refresh in {30 - (Math.floor(now / 1000) % 30)}s
        </p>
      </div>
      <p className="text-center text-sm text-slate-600">{lockStatus}</p>
      <p className="notice">
        Show this pass to your teacher. Attendance is recorded only after the teacher confirms it
        was saved.
      </p>
    </div>
  );
}
