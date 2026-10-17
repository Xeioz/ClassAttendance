import { useState, type FormEvent } from 'react';
import { normalizeId } from '../../utils/normalize';
import { errorMessage } from '../../utils/errors';
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
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const normalized = normalizeId(id);
      if (!/^\d{3,6}$/.test(challenge))
        throw new Error('Enter the 3–6 digit room challenge shown by your teacher.');
      setError('');
      try {
        if (remember) localStorage.setItem('attendance:student-id:v1', normalized);
        else localStorage.removeItem('attendance:student-id:v1');
      } catch {
        setError('ID could not be remembered. Your pass still works.');
      }
      setPass({ id: normalized, ch: challenge });
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <section className="card mx-auto max-w-lg">
      <p className="eyebrow">Student check-in</p>
      <h2 className="mb-2 mt-2 text-2xl">Your classroom pass</h2>
      <p className="mb-6 text-sm text-slate-600">
        Use your official ID and the challenge provided in class.
      </p>
      {pass ? (
        <>
          <DynamicQR id={pass.id} challenge={pass.ch} />
          <button className="secondary mt-5 w-full" onClick={() => setPass(undefined)}>
            Edit ID or challenge
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <label>
            Student ID
            <input
              autoComplete="off"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="2024-10492"
              maxLength={64}
              required
            />
          </label>
          <label>
            Room challenge
            <input
              inputMode="numeric"
              value={challenge}
              onChange={(event) => setChallenge(event.target.value)}
              placeholder="Ask your teacher"
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
            Remember my ID on this browser
          </label>
          <button className="btn">Display QR pass</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              try {
                localStorage.removeItem('attendance:student-id:v1');
                setId('');
                setRemember(false);
              } catch {
                setError('Unable to clear remembered ID. Use browser site-data settings.');
              }
            }}
          >
            Forget saved ID
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="notice mt-4">
          {error}
        </p>
      ) : null}
    </section>
  );
}
