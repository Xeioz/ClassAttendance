import { useInactivityLock } from '../../hooks/inactivityLock';
import { isTeacherBusy, useTeacherBusy } from '../../domain/operations';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { db, requestPersistence } from '../../db/db';
import { unlockVault } from '../../db/vault';
import { errorMessage } from '../../utils/errors';
import type { VaultKeys } from '../../types';
import { BackupControls } from './BackupControls';
import { TeacherWorkspace } from './TeacherWorkspace';

export function TeacherPortal({ onActive }: { onActive: (active: boolean) => void }) {
  const id = useId();
  const pinInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const [errorField, setErrorField] = useState<'pin' | 'confirmation'>();
  const unlockAttempt = useRef(0);
  const operationBusy = useTeacherBusy();
  const [lockRequested, setLockRequested] = useState(false);
  const [revision, setRevision] = useState(0);
  const [keys, setKeys] = useState<VaultKeys>();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [exists, setExists] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [persistence, setPersistence] = useState('');
  useEffect(() => {
    if (busy) return;
    if (errorField === 'pin') pinInput.current?.focus();
    if (errorField === 'confirmation') confirmationInput.current?.focus();
  }, [errorField, busy]);
  useEffect(() => {
    let alive = true;
    void db.meta
      .get('vault')
      .then((value) => {
        if (alive) setExists(Boolean(value));
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [keys, revision]);
  const lock = useCallback(() => {
    unlockAttempt.current++;
    setPin('');
    setConfirmation('');
    setBusy(false);
    if (isTeacherBusy()) {
      setLockRequested(true);
      return;
    }
    setLockRequested(false);
    setKeys(undefined);
    onActive(false);
  }, [onActive]);
  useEffect(() => {
    if (lockRequested && !operationBusy) lock();
  }, [lockRequested, operationBusy, lock]);
  useInactivityLock(Boolean(keys), lock);
  useEffect(
    () => () => {
      unlockAttempt.current++;
    },
    [],
  );
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const attempt = ++unlockAttempt.current;
    setError('');
    setErrorField(undefined);
    if (!/^\d{6,12}$/.test(pin)) {
      setError('Enter a PIN containing 6–12 digits.');
      setErrorField('pin');
      pinInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const hasVault = Boolean(await db.meta.get('vault'));
      if (attempt !== unlockAttempt.current) return;
      setExists(hasVault);
      if (!hasVault && pin !== confirmation) {
        setError('The new PIN and confirmation must match.');
        setErrorField('confirmation');
        confirmationInput.current?.focus();
        return;
      }
      const unlocked = await unlockVault(pin);
      if (attempt !== unlockAttempt.current) return;
      setKeys(unlocked);
      setPin('');
      setConfirmation('');
      void requestPersistence()
        .then((message) => {
          if (attempt === unlockAttempt.current) setPersistence(message);
        })
        .catch(() => {
          if (attempt === unlockAttempt.current)
            setPersistence('Storage persistence could not be checked. Keep encrypted backups.');
        });
    } catch (error) {
      if (attempt === unlockAttempt.current) setError(errorMessage(error));
    } finally {
      if (attempt === unlockAttempt.current) setBusy(false);
    }
  }
  return keys ? (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{persistence}</p>
        <button className="secondary" disabled={operationBusy} onClick={lock}>
          Lock teacher records
        </button>
      </div>
      <TeacherWorkspace keys={keys} onActive={onActive} />
    </>
  ) : (
    <div className="mx-auto grid max-w-md gap-5">
      <form noValidate className="card grid gap-5" onSubmit={unlock} aria-busy={busy}>
        <div>
          <p className="eyebrow">Teacher workspace</p>
          <h2 className="mt-2 text-2xl">
            {error && exists === undefined
              ? 'Storage unavailable'
              : exists === undefined
                ? 'Checking local workspace…'
                : exists === false
                  ? 'Create your teacher PIN'
                  : 'Unlock teacher portal'}
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
            aria-invalid={errorField === 'pin'}
            aria-describedby={errorField === 'pin' ? `${id}-error` : undefined}
            disabled={busy}
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
              ref={confirmationInput}
              aria-invalid={errorField === 'confirmation'}
              aria-describedby={errorField === 'confirmation' ? `${id}-error` : undefined}
              disabled={busy}
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
        {error && exists === undefined ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            Retry storage check
          </button>
        ) : null}
        {error ? (
          <p id={`${id}-error`} role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
      <BackupControls
        onRestored={() => {
          setPin('');
          setConfirmation('');
          setError('');
          setExists(undefined);
          setRevision((value) => value + 1);
        }}
      />
    </div>
  );
}
