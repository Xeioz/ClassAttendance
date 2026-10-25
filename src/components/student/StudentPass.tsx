import { useId, useRef, useState, type FormEvent } from 'react';
import { normalizeId } from '../../utils/normalize';
import { t } from '../../i18n';
import { DynamicQR } from './DynamicQR';

function rememberedId(): string {
  try {
    return localStorage.getItem('attendance:student-id:v1') ?? '';
  } catch {
    return '';
  }
}
export function StudentPass() {
  const [id, setId] = useState(rememberedId);
  const [challenge, setChallenge] = useState('');
  const [remember, setRemember] = useState(() => Boolean(rememberedId()));
  const [pass, setPass] = useState<{ id: string; ch: string }>();
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'id' | 'challenge'>();
  const idInput = useRef<HTMLInputElement>(null);
  const challengeInput = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setErrorField(undefined);
    let normalized: string;
    try {
      normalized = normalizeId(id);
    } catch {
      setError(t('student.idInvalid'));
      setErrorField('id');
      idInput.current?.focus();
      return;
    }
    if (!/^\d{3,6}$/.test(challenge)) {
      setError(t('student.challengeHint'));
      setErrorField('challenge');
      challengeInput.current?.focus();
      return;
    }
    try {
      if (remember) localStorage.setItem('attendance:student-id:v1', normalized);
      else localStorage.removeItem('attendance:student-id:v1');
    } catch {
      setError(t('student.rememberFailed'));
    }
    setPass({ id: normalized, ch: challenge });
  }
  return (
    <section className="card mx-auto max-w-lg">
      <p className="eyebrow">{t('student.eyebrow')}</p>
      <h2 className="mb-2 mt-2 text-2xl">{t('student.title')}</h2>
      <p className="mb-6 text-sm text-slate-600">{t('student.description')}</p>
      {pass ? (
        <>
          <DynamicQR id={pass.id} challenge={pass.ch} />
          <button
            type="button"
            className="secondary mt-5 w-full"
            onClick={() => setPass(undefined)}
          >
            {t('student.edit')}
          </button>
        </>
      ) : (
        <form noValidate onSubmit={submit} className="grid gap-5">
          <label>
            {t('student.id')}
            <input
              ref={idInput}
              aria-invalid={errorField === 'id'}
              aria-describedby={errorField === 'id' ? `${fieldId}-error` : undefined}
              autoComplete="off"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="2024-10492"
              maxLength={64}
              required
            />
          </label>
          <label>
            {t('student.challenge')}
            <input
              ref={challengeInput}
              aria-invalid={errorField === 'challenge'}
              aria-describedby={errorField === 'challenge' ? `${fieldId}-error` : undefined}
              inputMode="numeric"
              value={challenge}
              onChange={(event) => setChallenge(event.target.value)}
              placeholder={t('student.challengePlaceholder')}
              pattern="[0-9]{3,6}"
              maxLength={6}
              required
            />
          </label>
          <label className="flex min-h-12 items-center gap-3 font-normal">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-6 min-h-0 w-6"
            />
            {t('student.remember')}
          </label>
          <button className="btn">{t('student.display')}</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              try {
                localStorage.removeItem('attendance:student-id:v1');
                setId('');
                setRemember(false);
              } catch {
                setError(t('student.forgetFailed'));
                setErrorField(undefined);
              }
            }}
          >
            {t('student.forget')}
          </button>
        </form>
      )}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="notice mt-4">
          {error}
        </p>
      ) : null}
    </section>
  );
}
