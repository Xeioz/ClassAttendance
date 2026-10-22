import { useEffect, useRef, useState } from 'react';
import { flagDispute, resolveDispute, unresolvedDisputes } from '../../domain/audit';
import { errorMessage } from '../../utils/errors';
import type { AuditEntry, ScanResult, Session, VaultKeys } from '../../types';

interface DisputeDraft {
  sessionId: string;
  studentToken: string;
  name: string;
  firstAt: number;
  secondAt: number;
  reason: string;
}

export function DisputePanel({
  keys,
  session,
  events,
  candidate,
  onChanged,
  onReviewChange,
}: {
  keys: VaultKeys;
  session: Session;
  events: AuditEntry[];
  candidate?: ScanResult;
  onChanged: () => Promise<void>;
  onReviewChange?: (reviewing: boolean) => void;
}) {
  const [draft, setDraft] = useState<DisputeDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const pending = unresolvedDisputes(events);
  // Session switches/closure invalidate the entire review, including pending UI work.
  useEffect(() => {
    operation.current++;
    setDraft(undefined);
    setBusy(false);
    setError('');
    onReviewChange?.(false);
    return () => {
      operation.current++;
      onReviewChange?.(false);
    };
  }, [session.id, session.state, onReviewChange]);
  const currentDraft =
    draft?.sessionId === session.id && session.state === 'ACTIVE' ? draft : undefined;
  const candidateStudent = session.roster.find(
    (student) => student.token === candidate?.studentToken,
  );
  const canReview =
    candidate?.kind === 'duplicate' &&
    session.state === 'ACTIVE' &&
    candidateStudent &&
    Number.isFinite(candidate.firstAt) &&
    Number.isFinite(candidate.secondAt);
  function beginReview() {
    if (!canReview || !candidateStudent || !candidate) return;
    setError('');
    setDraft({
      sessionId: session.id,
      studentToken: candidateStudent.token,
      name: `${candidateStudent.name} · ${candidateStudent.displayId ?? candidateStudent.id}`,
      firstAt: candidate.firstAt!,
      secondAt: candidate.secondAt!,
      reason: '',
    });
    onReviewChange?.(true);
  }
  function cancelReview() {
    if (busy) return;
    operation.current++;
    setDraft(undefined);
    setError('');
    onReviewChange?.(false);
  }
  async function flag() {
    if (!currentDraft || busy) return;
    const review = currentDraft;
    const ticket = operation.current;
    setBusy(true);
    setError('');
    try {
      await flagDispute(
        keys,
        review.sessionId,
        review.studentToken,
        review.reason,
        review.secondAt,
        review.firstAt,
      );
    } catch (error) {
      if (ticket === operation.current) {
        setError(errorMessage(error));
        setBusy(false);
      }
      return;
    }
    if (ticket !== operation.current) return;
    // Once committed, never offer the same draft as an unsaved retry.
    setDraft(undefined);
    onReviewChange?.(false);
    try {
      await onChanged();
    } catch (error) {
      if (ticket === operation.current)
        setError(`Dispute saved, but the view could not refresh: ${errorMessage(error)}`);
    } finally {
      if (ticket === operation.current) setBusy(false);
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
      {currentDraft ? (
        <div className="mb-4 grid gap-3 border-b pb-4">
          <p className="text-sm font-semibold">Reviewing {currentDraft.name}</p>
          <p role="status" className="notice">
            Camera paused for this review. A scan already being saved may finish; this review stays
            attached to the student and times shown below. Cancel or save to resume.
          </p>
          <p className="text-sm">
            First presentation: {new Date(currentDraft.firstAt).toLocaleString()}
            <br />
            Second presentation: {new Date(currentDraft.secondAt).toLocaleString()}
          </p>
          <label>
            Reason for disputing this check-in
            <textarea
              value={currentDraft.reason}
              onChange={(event) => setDraft({ ...currentDraft, reason: event.target.value })}
              minLength={3}
              maxLength={500}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="secondary"
              disabled={
                busy ||
                currentDraft.reason.trim().length < 3 ||
                pending.some((event) => event.studentToken === currentDraft.studentToken)
              }
              onClick={() => void flag()}
            >
              {busy ? 'Saving dispute…' : 'Flag disputed check-in'}
            </button>
            <button className="secondary" disabled={busy} onClick={cancelReview}>
              Cancel dispute review
            </button>
          </div>
        </div>
      ) : canReview ? (
        <div className="mb-4 grid gap-3 border-b pb-4">
          <p className="text-sm font-semibold">{candidate.detail}</p>
          <button
            className="secondary justify-self-start"
            disabled={
              busy || pending.some((event) => event.studentToken === candidate.studentToken)
            }
            onClick={beginReview}
          >
            Review duplicate check-in
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
            disabled={session.state !== 'ACTIVE' || Boolean(currentDraft)}
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
