import type { ScanResult } from '../../types';
import { t } from '../../i18n';

const styles = {
  valid: 'border-emerald-800 bg-emerald-50 text-emerald-950',
  duplicate: 'border-slate-500 bg-slate-50 text-slate-900',
  unknown: 'border-amber-700 bg-amber-50 text-amber-950',
  error: 'border-red-800 bg-red-50 text-red-950',
};
export function AccessibleHUD({
  result,
  processing = false,
}: {
  result?: ScanResult;
  processing?: boolean;
}) {
  const displayedResult = processing ? undefined : result;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex min-h-28 items-start gap-4 rounded-xl border-2 p-4 ${displayedResult ? styles[displayedResult.kind] : 'border-slate-200 bg-slate-50'}`}
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
        {displayedResult?.kind === 'valid' ? (
          <path d="m7 12 3 3 7-7" />
        ) : displayedResult?.kind === 'duplicate' || displayedResult?.kind === 'unknown' ? (
          <path d="M12 7v6m0 3v1" />
        ) : displayedResult?.kind === 'error' ? (
          <path d="m8 8 8 8m0-8-8 8" />
        ) : (
          <path d="M12 6v6l4 2" />
        )}
      </svg>
      <div className="min-w-0">
        <p className="font-semibold">
          {processing ? t('hud.processing') : (displayedResult?.title ?? t('hud.ready'))}
        </p>
        <p className="mt-1 break-words text-sm">
          {processing
            ? t('hud.processingDetail')
            : (displayedResult?.detail ?? t('hud.readyDetail'))}
        </p>
      </div>
    </div>
  );
}
