import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { db, requestPersistence } from '../../db/db';
import { unlockVault } from '../../db/vault';
import { errorMessage } from '../../utils/errors';
import type { VaultKeys } from '../../types';
import { BackupControls } from './BackupControls';
import { TeacherWorkspace } from './TeacherWorkspace';

export function TeacherPortal({ onActive }: { onActive: (active: boolean) => void }) {
  const [keys, setKeys] = useState<VaultKeys>();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [exists, setExists] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [persistence, setPersistence] = useState('');
  const pinInput = useRef<HTMLInputElement>(null);
  const refreshVault = useCallback(async () => {
    setExists(Boolean(await db.meta.get('vault')));
  }, []);
  useEffect(() => {
    void refreshVault().catch((error) => setError(errorMessage(error)));
  }, [keys, refreshVault]);
  async function restored() {
    setPin('');
    setConfirmation('');
    setError('');
    await refreshVault();
    pinInput.current?.focus();
  }
  const lock = useCallback(() => {
    setKeys(undefined);
    onActive(false);
  }, [onActive]);
  useEffect(() => {
    if (!keys) return;
    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(lock, 15 * 60_000);
    };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('pagehide', lock);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('pagehide', lock);
    };
  }, [keys, lock]);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const hasVault = Boolean(await db.meta.get('vault'));
      setExists(hasVault);
      if (!hasVault && pin !== confirmation)
        throw new Error('The new PIN and confirmation must match.');
      const unlocked = await unlockVault(pin);
      setKeys(unlocked);
      setPin('');
      setConfirmation('');
      setPersistence(await requestPersistence());
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return keys ? (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{persistence}</p>
        <button className="secondary" onClick={lock}>
          Lock teacher records
        </button>
      </div>
      <TeacherWorkspace keys={keys} onActive={onActive} />
      <BackupControls keys={keys} />
    </>
  ) : (
    <div className="mx-auto grid max-w-xl gap-5">
      <form className="card grid gap-5" onSubmit={unlock}>
        <div>
          <p className="eyebrow">Teacher workspace</p>
          <h2 className="mt-2 text-2xl">
            {exists === false ? 'Protect your local records' : 'Unlock local records'}
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Records stay in this browser. Your Master PIN is never sent to a server.
          </p>
        </div>
        <p className="notice">
          A short numeric PIN has limited resistance to offline guessing. Use a long random PIN,
          protect this device, and keep encrypted backups. Encryption alone does not establish legal
          compliance.
        </p>
        <label>
          Master PIN (6–12 digits)
          <input
            ref={pinInput}
            type="password"
            inputMode="numeric"
            autoComplete={exists ? 'current-password' : 'new-password'}
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            required
          />
        </label>
        {exists === false ? (
          <label>
            Confirm new PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
        ) : null}
        <button className="btn" disabled={busy || exists === undefined}>
          {busy ? 'Unlocking…' : exists ? 'Unlock teacher workspace' : 'Create encrypted workspace'}
        </button>
        {error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
      <BackupControls onRestored={restored} />
    </div>
  );
}
