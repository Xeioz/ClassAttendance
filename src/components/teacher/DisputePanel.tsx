import { useState } from 'react';
import { flagDispute, resolveDispute, unresolvedDisputes } from '../../domain/audit';
import { errorMessage } from '../../utils/errors';
import type { AuditEntry, ScanResult, Session, VaultKeys } from '../../types';

export function DisputePanel({
  keys,
  session,
  events,
  candidate,
  onChanged,
}: {
  keys: VaultKeys;
  session: Session;
  events: AuditEntry[];
  candidate?: ScanResult;
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = unresolvedDisputes(events);
  async function flag() {
    if (!candidate?.studentToken) return;
    setBusy(true);
    setError('');
    try {
      await flagDispute(keys, session.id, candidate.studentToken, reason, candidate.secondAt);
      setReason('');
      await onChanged();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Dispute review</h2>
        <p className="text-sm font-semibold">{pending.length} unresolved</p>
      </div>
      <p className="my-3 text-sm text-slate-600">
        A duplicate alone is not misconduct. Check the student’s identity. Flagging preserves
        attendance and both presentation times.
      </p>
      {candidate?.kind === 'duplicate' && session.state === 'ACTIVE' ? (
        <div className="mb-4 grid gap-3 border-b pb-4">
          <p className="text-sm font-semibold">{candidate.detail}</p>
          <label>
            Reason for disputing this check-in
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
            />
          </label>
          <button
            className="secondary justify-self-start"
            disabled={
              busy ||
              reason.trim().length < 3 ||
              pending.some((event) => event.studentToken === candidate.studentToken)
            }
            onClick={() => void flag()}
          >
            Flag disputed check-in
          </button>
        </div>
      ) : null}
      {!pending.length ? (
        <p className="text-sm text-slate-600">No unresolved disputes.</p>
      ) : (
        pending.map((event) => (
          <DisputeRow
            key={event.eventId}
            event={event}
            name={
              session.roster.find((student) => student.token === event.studentToken)?.name ??
              event.studentId ??
              'Student'
            }
            disabled={session.state !== 'ACTIVE'}
            resolve={async (reason) => {
              await resolveDispute(keys, session.id, event.eventId, reason);
              await onChanged();
            }}
          />
        ))
      )}
      {error ? (
        <p role="alert" className="notice mt-3">
          {error}
        </p>
      ) : null}
    </section>
  );
}
function DisputeRow({
  event,
  name,
  disabled,
  resolve,
}: {
  event: AuditEntry;
  name: string;
  disabled: boolean;
  resolve: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="mb-4 grid gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4"
      onSubmit={(form) => {
        form.preventDefault();
        setBusy(true);
        setError('');
        void resolve(reason)
          .catch((error) => setError(errorMessage(error)))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-semibold">{name}</p>
      <p className="text-sm">
        First presentation: {event.firstAt ? new Date(event.firstAt).toLocaleString() : 'Unknown'}
        <br />
        Second presentation:{' '}
        {event.secondAt ? new Date(event.secondAt).toLocaleString() : 'Unknown'}
      </p>
      <p className="text-sm">{event.reason}</p>
      <label>
        Resolution and identity-check outcome
        <textarea
          value={reason}
          onChange={(input) => setReason(input.target.value)}
          minLength={3}
          maxLength={500}
          required
          disabled={disabled || busy}
        />
      </label>
      <p className="text-xs">
        Resolving the review keeps the attendance status. Use manual correction separately if
        needed.
      </p>
      <button className="secondary justify-self-start" disabled={disabled || busy}>
        Resolve dispute
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
