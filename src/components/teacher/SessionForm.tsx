import { useState, type FormEvent } from 'react';
import { createSession } from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import type { ClassOffering, Session, VaultKeys } from '../../types';

export function SessionForm({
  keys,
  sections,
  onCreated,
  offering,
}: {
  keys: VaultKeys;
  offering?: ClassOffering;
  sections: string[];
  onCreated: (session: Session) => Promise<void>;
}) {
  const [course, setCourse] = useState(offering?.course ?? '');
  const [institution, setInstitution] = useState(offering?.institution ?? '');
  const [subject, setSubject] = useState(offering?.subject ?? '');
  const [room, setRoom] = useState(offering?.room ?? '');
  const [section, setSection] = useState(offering?.section ?? '');
  const [pin, setPin] = useState(() =>
    String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)),
  );
  const [grace, setGrace] = useState(offering?.graceMinutes ?? 15);
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
        classId: offering?.id,
        timezone: offering?.timezone,
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
            readOnly={Boolean(offering)}
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
            disabled={Boolean(offering)}
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
      <button
        type="button"
        className="secondary justify-self-start"
        onClick={() =>
          setPin(String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)))
        }
      >
        Generate another challenge
      </button>
      <p className="text-sm text-slate-600">
        Report timezone: {offering?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}.
        Late means saved after start + grace. Use a reasoned correction for students already waiting
        at the cutoff.
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
