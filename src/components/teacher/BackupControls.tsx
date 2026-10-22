import { useId, useState, type FormEvent } from 'react';
import { exportBackup, restoreBackup } from '../../db/backup';
import { errorMessage } from '../../utils/errors';
import type { VaultKeys } from '../../types';
import { db } from '../../db/db';
import { recordBackupRequested, recordRestoreCompleted } from '../../domain/readiness';
import { t } from '../../i18n';

export function BackupControls({
  keys,
  onRestored,
}: {
  keys?: VaultKeys;
  onRestored?: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [restoreError, setRestoreError] = useState(false);
  const id = useId();
  async function backup() {
    if (!keys) return;
    setBusy(true);
    setMessage('');
    try {
      await exportBackup(keys);
      recordBackupRequested(keys.salt);
      setMessage(t('readiness.backup.downloaded'));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function restore(event: FormEvent) {
    event.preventDefault();
    if (!file || !confirm) return;
    setBusy(true);
    setMessage('');
    setRestoreError(false);
    try {
      const restored = await restoreBackup(file, pin);
      // Read the restored identity only after replacement commits. This observation
      // is optional and must never turn a completed restore into a reported failure.
      try {
        const vault = await db.meta.get('vault');
        if (vault) recordRestoreCompleted(vault.salt);
      } catch {
        /* Activity remains unknown if the metadata cannot be read. */
      }
      setPin('');
      setConfirm(false);
      try {
        await onRestored?.();
      } catch {
        setMessage(t('readiness.backup.refreshFailed'));
        return;
      }
      setMessage(t('readiness.backup.restored', restored));
    } catch (error) {
      setRestoreError(true);
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="backup-controls" tabIndex={-1} className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-xl">
        {t('readiness.backup.title')}
      </h2>
      <p id={`${id}-description`} className="mb-4 mt-2 text-sm text-slate-600">
        {t('readiness.backup.description')}
      </p>
      {keys ? (
        <button
          id="backup-download"
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void backup()}
        >
          {t(busy ? 'readiness.backup.preparing' : 'readiness.backup.download')}
        </button>
      ) : (
        <form
          onSubmit={restore}
          className="grid gap-4"
          aria-describedby={`${id}-description`}
          aria-busy={busy}
        >
          <label>
            {t('readiness.backup.file')}
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                setFile(event.target.files?.[0]);
                setConfirm(false);
                setMessage('');
                setRestoreError(false);
              }}
              aria-invalid={restoreError || undefined}
              aria-describedby={restoreError ? `${id}-result` : undefined}
              required
              disabled={busy}
            />
          </label>
          <label>
            {t('readiness.backup.pin')}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setRestoreError(false);
              }}
              aria-invalid={restoreError || undefined}
              aria-describedby={`${id}-pin-help${restoreError ? ` ${id}-result` : ''}`}
              required
              disabled={busy}
            />
          </label>
          <p id={`${id}-pin-help`} className="text-sm text-slate-600">
            {t('readiness.backup.pinHelp')}
          </p>
          <label className="flex min-h-12 items-center gap-3 font-normal">
            <input
              type="checkbox"
              className="h-6 min-h-0 w-6"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              disabled={busy}
              required
              aria-describedby={`${id}-description ${id}-templates`}
            />
            {t('readiness.backup.replace')}
          </label>
          <p id={`${id}-templates`} className="text-sm text-slate-600">
            {t('readiness.backup.templates')}
          </p>
          <button
            type="submit"
            className="secondary justify-self-start"
            disabled={busy || !confirm}
          >
            {t(busy ? 'readiness.backup.restoring' : 'readiness.backup.restore')}
          </button>
        </form>
      )}
      {message ? (
        <p id={`${id}-result`} role="status" aria-atomic="true" className="notice mt-4">
          {message}
        </p>
      ) : null}
    </section>
  );
}
