import { useState, type FormEvent } from 'react';
import type { ClassPrivate } from '../../types';
import { errorMessage } from '../../utils/errors';
export function ClassForm({
  onSave,
  initial,
}: {
  onSave: (input: ClassPrivate) => Promise<void>;
  initial?: ClassPrivate;
}) {
  const [input, setInput] = useState<ClassPrivate>(
    initial ?? {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      course: '',
      section: '',
      term: '',
      subject: '',
      institution: '',
      room: '',
      graceMinutes: 15,
    },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(input);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card grid gap-5" onSubmit={submit}>
      <div>
        <p className="eyebrow">Class setup</p>
        <h2 className="mt-2 text-2xl">{initial ? 'Class defaults' : 'Add a class'}</h2>
        <p className="mt-3 text-sm text-slate-600">
          Course + section + term identify this offering. Enrollment and historical sessions stay
          separate from other classes.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['course', 'section', 'term', 'subject', 'institution', 'room'] as const).map((field) => (
          <label key={field}>
            {
              {
                course: 'Course code',
                section: 'Section',
                term: 'Term (optional)',
                subject: 'Subject (optional)',
                institution: 'Institution (optional)',
                room: 'Room (optional)',
              }[field]
            }
            <input
              readOnly={Boolean(initial) && ['course', 'section', 'term'].includes(field)}
              value={input[field]}
              required={field === 'course' || field === 'section'}
              maxLength={100}
              onChange={(event) => setInput({ ...input, [field]: event.target.value })}
            />
          </label>
        ))}
        <label>
          Default grace period (minutes)
          <input
            type="number"
            min={0}
            max={180}
            required
            value={input.graceMinutes}
            onChange={(event) => setInput({ ...input, graceMinutes: Number(event.target.value) })}
          />
        </label>
      </div>
      <label>
        Default report timezone
        <input
          value={input.timezone ?? ''}
          onChange={(event) => setInput({ ...input, timezone: event.target.value })}
          placeholder="Asia/Manila"
          required
        />
      </label>
      <p className="text-sm text-slate-600">
        Defaults apply to new sessions only. Start time is entered using this device’s local clock;
        the report timezone controls date grouping.
      </p>
      <button className="btn justify-self-start" disabled={busy}>
        {busy ? 'Saving…' : initial ? 'Save defaults' : 'Create class and add students'}
      </button>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </form>
  );
}
