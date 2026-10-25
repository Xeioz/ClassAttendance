import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { db, requestPersistence } from '../../db/db';
import { unlockVault } from '../../db/vault';
import { errorMessage } from '../../utils/errors';
import type { VaultKeys } from '../../types';
import { BackupControls } from './BackupControls';
import { TeacherWorkspace } from './TeacherWorkspace';
import { useInactivityLock } from '../../hooks/inactivityLock';

export function TeacherPortal({ onActive }: { onActive: (active: boolean) => void }) {
  const [keys, setKeys] = useState<VaultKeys>();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [exists, setExists] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'pin' | 'confirmation'>();
  const [persistence, setPersistence] = useState('');
  const pinInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const unlockAttempt = useRef(0);
  const id = useId();
  useEffect(() => {
    if (busy) return;
    if (errorField === 'pin') pinInput.current?.focus();
    if (errorField === 'confirmation') confirmationInput.current?.focus();
  }, [errorField, busy]);
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
    setErrorField(undefined);
    await refreshVault();
    pinInput.current?.focus();
  }
  const lock = useCallback(() => {
    unlockAttempt.current++;
    setKeys(undefined);
    setPin('');
    setConfirmation('');
    setBusy(false);
    onActive(false);
  }, [onActive]);
  useInactivityLock(!!keys, lock);
  useEffect(() => {
    return () => {
      unlockAttempt.current++;
    };
  }, []);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const attempt = ++unlockAttempt.current;
    setError('');
    setErrorField(undefined);
    if (!/^\d{6,12}$/.test(pin)) {
      setError(t('portal.pinInvalid'));
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
        setError(t('portal.pinMismatch'));
        setErrorField('confirmation');
        confirmationInput.current?.focus();
        return;
      }
      const unlocked = await unlockVault(pin);
      if (attempt !== unlockAttempt.current) return;
      setKeys(unlocked);
      setPin('');
      setConfirmation('');
      // Storage permission is advisory and must not block or undo authentication.
      void requestPersistence()
        .then((message) => {
          if (attempt === unlockAttempt.current) setPersistence(message);
        })
        .catch(() => {
          if (attempt === unlockAttempt.current) setPersistence(t('portal.persistenceUnknown'));
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
        <button type="button" className="secondary" onClick={lock}>
          {t('portal.lock')}
        </button>
      </div>
      <TeacherWorkspace keys={keys} onActive={onActive} />
      <BackupControls keys={keys} />
    </>
  ) : (
    <div className="mx-auto grid max-w-xl gap-5">
      <form noValidate className="card grid gap-5" onSubmit={unlock} aria-busy={busy}>
        <div>
          <p className="eyebrow">{t('portal.eyebrow')}</p>
          <h2 className="mt-2 text-2xl">
            {exists === false ? t('portal.protect') : t('portal.unlock')}
          </h2>
          <p className="mt-3 text-sm text-slate-600">{t('portal.description')}</p>
        </div>
        <p className="notice">{t('portal.security')}</p>
        <label>
          {t('portal.pin')}
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
            {t('portal.confirm')}
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
          {busy
            ? t('portal.unlocking')
            : exists === undefined
              ? t('portal.loading')
              : exists
                ? t('portal.unlockButton')
                : t('portal.create')}
        </button>
        {error ? (
          <p id={`${id}-error`} role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
      <BackupControls onRestored={restored} />
    </div>
  );
}
