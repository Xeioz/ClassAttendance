import { requestPersistence } from '../../db/db';
import { useState, type FormEvent } from 'react';
import { exportBackup, restoreBackup } from '../../db/backup';
import { errorMessage } from '../../utils/errors';
import type { VaultKeys } from '../../types';

export function BackupControls({
  keys,
  onRestored,
}: {
  keys?: VaultKeys;
  onRestored?: () => void;
}) {
  const [file, setFile] = useState<File>();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function backup() {
    if (!keys) return;
    setBusy(true);
    try {
      await exportBackup(keys);
      setMessage(
        'Encrypted backup download requested. Keep it outside this device and test restoration.',
      );
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
    try {
      const restored = await restoreBackup(file, pin);
      setPin('');
      setConfirm(false);
      onRestored?.();
      setMessage(
        `Restored ${restored.courses} courses, ${restored.students} roster entries, and ${restored.sessions} attendance sessions. Unlock with the backup PIN.`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2 className="text-xl">Encrypted backup & recovery</h2>
      <p className="mb-4 mt-2 text-sm text-slate-600">
        Browser data is the local working copy. Clearing site data or losing this device can destroy
        it. A forgotten PIN cannot be reset to decrypt old records.
      </p>
      {keys && (
        <button
          className="secondary mb-4"
          disabled={busy}
          onClick={() => void requestPersistence().then(setMessage)}
        >
          Check storage persistence
        </button>
      )}
      {keys ? (
        <button className="secondary" disabled={busy} onClick={() => void backup()}>
          {busy ? 'Preparing…' : 'Download encrypted backup'}
        </button>
      ) : (
        <form onSubmit={restore} className="grid gap-4">
          <label>
            Encrypted JSON backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                setFile(event.target.files?.[0]);
                setConfirm(false);
              }}
              required
              disabled={busy}
            />
          </label>
          <label>
            Backup Master PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="flex min-h-12 items-center gap-3 font-normal">
            <input
              type="checkbox"
              className="h-6 min-h-0 w-6"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              disabled={busy}
            />
            Replace all attendance data currently in this browser
          </label>
          <button className="secondary justify-self-start" disabled={busy || !confirm}>
            {busy ? 'Validating and restoring…' : 'Restore backup'}
          </button>
        </form>
      )}
      {message ? (
        <p role="status" className="notice mt-4">
          {message}
        </p>
      ) : null}
    </section>
  );
}
