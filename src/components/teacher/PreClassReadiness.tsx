import { useEffect, useState } from 'react';
import type { ClassOffering, Session } from '../../types';
import { verifyOfflineResources } from '../../utils/offline';
import { errorMessage } from '../../utils/errors';

export function PreClassReadiness({
  offering,
  members,
  active,
}: {
  offering: ClassOffering;
  members: number;
  active?: Session;
}) {
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const invalidate = () => setEvidence([]);
    navigator.serviceWorker?.addEventListener('controllerchange', invalidate);
    window.addEventListener('focus', invalidate);
    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', invalidate);
      window.removeEventListener('focus', invalidate);
    };
  }, []);
  async function check() {
    setBusy(true);
    const checkedController = navigator.serviceWorker?.controller;
    const results: string[] = [];
    try {
      await verifyOfflineResources();
      results.push(
        '✓ Current website resources verified, including import, camera and export code.',
      );
    } catch (error) {
      results.push(`! ${errorMessage(error)}`);
    }
    try {
      const persisted = await navigator.storage?.persisted?.();
      const estimate = await navigator.storage?.estimate?.();
      results.push(
        persisted
          ? '✓ Persistent storage granted. Keep encrypted backups.'
          : '! Persistent storage is not confirmed. Keep an encrypted backup.',
      );
      if (estimate?.quota !== undefined && estimate.usage !== undefined)
        results.push(
          `Storage available: ${Math.max(0, Math.round((estimate.quota - estimate.usage) / 1048576))} MB (browser estimate).`,
        );
    } catch {
      results.push('! Browser storage estimate unavailable.');
    }
    results.push(
      typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? 'Camera API available. Test permission and QR decoding from the attendance scanner before class.'
        : '! Camera API unavailable. Use manual attendance.',
    );
    setEvidence(
      checkedController === navigator.serviceWorker?.controller
        ? results
        : ['! Website version changed during preparation. Check browser readiness again.'],
    );
    setBusy(false);
  }
  return (
    <section className="mt-5 rounded-xl border border-slate-200 p-4" aria-label="Class readiness">
      <h4 className="font-semibold">Before class</h4>
      <ul className="my-3 grid gap-2 text-sm">
        <li>
          {members ? '✓' : '!'} {members} students enrolled in {offering.course} /{' '}
          {offering.section} / {offering.term}.
        </li>
        <li>
          {active
            ? `! Attendance is already active for ${active.course}. Resume or close it first.`
            : '✓ No attendance session is currently active.'}
        </li>
        {evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button className="secondary" disabled={busy} onClick={() => void check()}>
        {busy ? 'Checking…' : 'Check browser readiness'}
      </button>
      <p role="status" className="mt-3 text-xs text-slate-600">
        {evidence.length ? 'Checked in this view. Recheck after changing browser settings. ' : ''}
        Use the correct device time. Reopen your saved link without a connection before relying on
        offline attendance.
      </p>
    </section>
  );
}
