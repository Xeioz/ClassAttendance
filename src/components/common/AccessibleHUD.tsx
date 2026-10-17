import type { ScanResult } from '../../types';

const styles = {
  valid: 'border-emerald-800 bg-emerald-50 text-emerald-950',
  duplicate: 'border-slate-500 bg-slate-50 text-slate-900',
  unknown: 'border-amber-700 bg-amber-50 text-amber-950',
  error: 'border-red-800 bg-red-50 text-red-950',
};
export function AccessibleHUD({ result }: { result?: ScanResult }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex min-h-28 items-start gap-4 rounded-xl border-2 p-4 ${result ? styles[result.kind] : 'border-slate-200 bg-slate-50'}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="32"
        height="32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        {result?.kind === 'valid' ? (
          <path d="m7 12 3 3 7-7" />
        ) : result?.kind === 'duplicate' ? (
          <path d="M12 7v6m0 3v1" />
        ) : (
          <path d="m8 8 8 8m0-8-8 8" />
        )}
      </svg>
      <div>
        <p className="font-semibold">{result?.title ?? 'Ready for attendance'}</p>
        <p className="mt-1 break-words text-sm">
          {result?.detail ??
            'Verify the student presenting the pass. A QR code alone does not prove identity.'}
        </p>
      </div>
    </div>
  );
}
