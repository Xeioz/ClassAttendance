import { useState, type FormEvent } from 'react';
import { createSession } from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import type { Session, VaultKeys } from '../../types';

export function SessionForm({
  keys,
  sections,
  onCreated,
}: {
  keys: VaultKeys;
  sections: string[];
  onCreated: (session: Session) => Promise<void>;
}) {
  const [course, setCourse] = useState('');
  const [institution, setInstitution] = useState('');
  const [subject, setSubject] = useState('');
  const [room, setRoom] = useState('');
  const [section, setSection] = useState('');
  const [pin, setPin] = useState('');
  const [grace, setGrace] = useState(15);
  const [start, setStart] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await createSession(keys, {
        institution: institution.trim(),
        subject: subject.trim(),
        room: room.trim(),
        course,
        section: section || sections[0] || '',
        roomPin: pin,
        startsAt: new Date(start).getTime(),
        graceMinutes: grace,
      });
      await onCreated(session);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card grid gap-4">
      <div>
        <p className="eyebrow">Before scanning</p>
        <h2 className="mt-2 text-xl">Start a class session</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Institution (optional)
          <input
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            maxLength={150}
          />
        </label>
        <label>
          Subject (optional)
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={150}
          />
        </label>
        <label>
          Room (optional)
          <input value={room} onChange={(event) => setRoom(event.target.value)} maxLength={150} />
        </label>
        <label>
          Course
          <input
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            placeholder="IT 101"
            maxLength={100}
            required
          />
        </label>
        <label>
          Section
          <select
            value={section || sections[0] || ''}
            onChange={(event) => setSection(event.target.value)}
            required
          >
            {!sections.length ? (
              <option value="">Import a roster first</option>
            ) : (
              sections.map((item) => <option key={item}>{item}</option>)
            )}
          </select>
        </label>
        <label>
          Room challenge
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{3,6}"
            placeholder="3–6 digits"
            required
          />
        </label>
        <label>
          Start time (this device's timezone)
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
        </label>
        <label>
          Grace period in minutes
          <input
            type="number"
            min="0"
            max="180"
            step="1"
            value={grace}
            onChange={(event) => setGrace(Number(event.target.value))}
            required
          />
        </label>
      </div>
      <p className="text-sm text-slate-600">
        Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Late means saved after start +
        grace. Use a reasoned correction for students already waiting at the cutoff.
      </p>
      <button className="btn justify-self-start" disabled={busy || !sections.length}>
        {busy ? 'Creating…' : 'Create attendance session'}
      </button>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
    </form>
  );
}
