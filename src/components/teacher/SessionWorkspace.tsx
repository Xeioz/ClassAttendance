import { usePagination } from '../../hooks/pagination';
import { Pagination } from '../common/Pagination';
import { normalizeId } from '../../utils/normalize';
import { isTeacherBusy, useTeacherBusy } from '../../domain/operations';
import { useCallback, useEffect, useRef, useState } from 'react';
import { closeSession, recordAttendance, reopenSession } from '../../domain/attendance';
import { unresolvedDisputes } from '../../domain/audit';
import { attendanceSummary, readReportSnapshot } from '../../domain/reports';
import { errorMessage } from '../../utils/errors';
import { enableAudio, feedback } from '../../utils/feedback';
import type { AttendancePrivate, AuditEntry, ScanResult, Session, VaultKeys } from '../../types';
import { AccessibleHUD } from '../common/AccessibleHUD';
import { AuditTrail } from './AuditTrail';
import { DisputePanel } from './DisputePanel';
import { ExportModal } from './ExportModal';
import { ManualEntryDialog } from './ManualEntryDialog';
import { ScannerView } from './ScannerView';

export function SessionWorkspace({
  keys,
  onActive,
  sessionId,
  onLifecycleChanged,
}: {
  keys: VaultKeys;
  sessionId: string;
  onLifecycleChanged?: () => Promise<void>;
  onActive: (active: boolean) => void;
}) {
  const operationBusy = useTeacherBusy();
  const [session, setSession] = useState<Session>();
  const [attendance, setAttendance] = useState<Map<string, AttendancePrivate>>(new Map());
  const [events, setEvents] = useState<AuditEntry[]>([]);
  const [result, setResult] = useState<ScanResult>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [view, setView] = useState<'scan' | 'review'>('scan');
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const scanGeneration = useRef(0);
  const reviewState = useRef(false);
  const onReviewChange = useCallback((value: boolean) => {
    if (reviewState.current === value) return;
    reviewState.current = value;
    scanGeneration.current++;
    setReviewing(value);
    if (!value) setResult(undefined);
  }, []);
  const sequence = useRef(0);
  const active = session?.state === 'ACTIVE';
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const snapshot = await readReportSnapshot(keys, sessionId);
    if (request !== sequence.current) return;
    setSession(snapshot.session);
    setAttendance(snapshot.attendance);
    setEvents(snapshot.audit);
  }, [keys, sessionId]);
  useEffect(() => {
    void refresh().catch((error) => setError(errorMessage(error)));
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    onActive(active || pending || busy);
    return () => onActive(false);
  }, [active, pending, busy, onActive]);
  useEffect(() => {
    const focus = () => {
      void refresh().catch((error) => setError(errorMessage(error)));
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === 'F2' &&
        session?.state === 'ACTIVE' &&
        !pending &&
        !busy &&
        !reviewing &&
        !isTeacherBusy()
      ) {
        event.preventDefault();
        setManualOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [session?.state, pending, busy, reviewing]);
  async function refreshAfterSave() {
    try {
      await refresh();
    } catch (error) {
      setError(`Saved, but the view could not refresh: ${errorMessage(error)}`);
    }
  }
  async function scan(raw: string) {
    if (!session || reviewState.current) return;
    const generation = scanGeneration.current;
    try {
      const outcome = await recordAttendance(keys, session.id, { raw });
      if (generation !== scanGeneration.current) return;
      setResult(outcome);
      if (outcome.kind !== 'duplicate') feedback(outcome.kind === 'valid', sound);
      await refreshAfterSave();
    } catch (error) {
      if (generation !== scanGeneration.current) return;
      setResult({ kind: 'error', title: 'Not saved', detail: errorMessage(error) });
      feedback(false, sound);
    }
  }
  async function finish() {
    if (!session || !confirmClose) return;
    setBusy(true);
    setError('');
    try {
      await closeSession(keys, session);
      setConfirmClose(false);
      await refreshAfterSave();
      await onLifecycleChanged?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await reopenSession(keys, session.id, reopenReason);
      setReopenReason('');
      setResult(undefined);
      await refreshAfterSave();
      await onLifecycleChanged?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const summary = session ? attendanceSummary(session, attendance) : undefined;
  const pendingDisputes = unresolvedDisputes(events).length;
  const filtered =
    session?.roster.filter((student) => {
      let normalized = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
      try {
        normalized = normalizeId(query);
      } catch {
        /* Names use the text search. */
      }
      return (
        `${student.name} ${student.displayId ?? student.id} ${student.id}`
          .toLowerCase()
          .includes(query.toLowerCase()) ||
        (normalized.length > 0 && student.id.includes(normalized))
      );
    }) ?? [];
  const pages = usePagination(filtered, 50, `${sessionId}:${query}`);
  return (
    <div className="mb-5 grid gap-5">
      {session && summary ? (
        <>
          {session.state === 'ACTIVE' && (
            <nav aria-label="Attendance task" className="flex flex-wrap gap-2">
              <button
                className={view === 'scan' ? 'btn' : 'secondary'}
                disabled={pending || busy || operationBusy || manualOpen || reviewing}
                onClick={() => setView('scan')}
              >
                Scan attendance
              </button>
              <button
                className={view === 'review' ? 'btn' : 'secondary'}
                disabled={pending || busy || operationBusy || manualOpen || reviewing}
                onClick={() => setView('review')}
              >
                Review attendance
              </button>
            </nav>
          )}
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {session.state === 'CLOSED'
                    ? 'Closed / reconciled · read only'
                    : 'Active session'}
                </p>
                <h2 className="mt-2 text-2xl">
                  {session.course}{' '}
                  <span className="font-normal text-slate-500">/ {session.section}</span>
                </h2>
                <p className="mt-2 text-sm">
                  {session.institution}
                  {session.subject ? ` · ${session.subject}` : ''}
                  {session.room ? ` · ${session.room}` : ''}
                </p>
                <p className="mt-2 text-sm">
                  Room challenge: <strong className="font-mono text-lg">{session.roomPin}</strong> ·{' '}
                  {session.graceMinutes} minute grace
                </p>
              </div>
              {(view === 'review' || session.state === 'CLOSED') && (
                <ExportModal keys={keys} sessionId={session.id} />
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
              {(view === 'scan' && active
                ? [
                    ['Enrolled', summary.total],
                    ['Recorded', summary.total - summary.counts.PENDING],
                    ['Not yet recorded', summary.counts.PENDING],
                  ]
                : [
                    ['Enrolled', summary.total],
                    ['Present', summary.counts.PRESENT],
                    ['Late', summary.counts.LATE],
                    ['Not yet recorded', summary.counts.PENDING],
                    ['Absent', summary.counts.ABSENT],
                    ['Excused', summary.counts.EXCUSED],
                  ]
              ).map(([label, value]) => (
                <div className="metric" key={label}>
                  <p className="text-xs font-semibold text-slate-600">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              Attendance rate: {(summary.rate * 100).toFixed(1)}% (present + late / enrolled).{' '}
              {pendingDisputes} unresolved disputes.
            </p>
          </section>
          {session.state === 'ACTIVE' ? (
            <section className={`card grid gap-5 ${view !== 'scan' ? 'hidden' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">Record attendance</h2>
                <button
                  className="secondary"
                  disabled={pending || busy || operationBusy || reviewing}
                  onClick={() => setManualOpen(true)}
                >
                  Manual check-in / correction (F2)
                </button>
              </div>
              <AccessibleHUD result={result} processing={pending} />
              {result?.kind === 'duplicate' && (
                <button
                  className="secondary justify-self-start"
                  disabled={pending || busy || operationBusy || reviewing}
                  onClick={() => setView('review')}
                >
                  Pause and review duplicate
                </button>
              )}
              <p className="text-sm text-slate-600">
                Processed: {summary.total - summary.counts.PENDING} / {summary.total}. Includes
                excused and explicit absent decisions; this is not a count of physical arrivals.
              </p>
              {pending ? <p role="status">Saving scan…</p> : null}
              <button
                className="secondary justify-self-start"
                aria-pressed={sound}
                onClick={() => {
                  if (sound) setSound(false);
                  else
                    void enableAudio()
                      .then(() => setSound(true))
                      .catch((error) => setError(errorMessage(error)));
                }}
              >
                Sound {sound ? 'on · mute' : 'off · enable'}
              </button>
              <ScannerView
                key={session.id}
                onScan={scan}
                onPending={setPending}
                paused={manualOpen || reviewing || view !== 'scan' || busy}
              />
              {manualOpen ? (
                <p className="text-sm">Camera paused while manual attendance is open.</p>
              ) : null}
            </section>
          ) : (
            <section className="card">
              <h2 className="text-xl">Reopen for attendance changes</h2>
              <p className="my-3 text-sm text-slate-600">
                Reopening preserves recorded attendance and returns automatic closure absences to
                not yet recorded. The reason enters the audit trail.
              </p>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void reopen();
                }}
              >
                <label>
                  Reason to reopen
                  <textarea
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <button
                  className="secondary justify-self-start"
                  disabled={busy || operationBusy || active}
                >
                  Reopen session
                </button>
              </form>
            </section>
          )}
          <div
            className={view === 'review' || session.state === 'CLOSED' ? 'grid gap-5' : 'hidden'}
          >
            <DisputePanel
              key={session.id}
              keys={keys}
              session={session}
              events={events}
              candidate={result}
              onChanged={refreshAfterSave}
              onReviewChange={onReviewChange}
            />
          </div>
          <section
            className={`card ${view !== 'review' && session.state === 'ACTIVE' ? 'hidden' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl">Attendance roster</h2>
              <label>
                Search roster
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name or student ID"
                />
              </label>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Attendance for selected session</caption>
                <thead>
                  <tr>
                    {['Student ID', 'Official name', 'Status', 'Recorded / corrected'].map(
                      (label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pages.visible.map((student) => {
                    const entry = attendance.get(student.token);
                    return (
                      <tr key={student.token} className="border-t">
                        <td className="whitespace-nowrap p-3 font-mono">
                          {student.displayId ?? student.id}
                        </td>
                        <td className="p-3">{student.name}</td>
                        <td className="p-3 font-semibold">{entry?.status ?? 'Not yet recorded'}</td>
                        <td className="p-3">
                          {entry && entry.status !== 'ABSENT'
                            ? new Date(entry.originalAt ?? entry.at).toLocaleTimeString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pages.page}
              pageSize={50}
              count={filtered.length}
              label="Attendance roster pages"
              onPage={pages.setPage}
            />
            {session.state === 'ACTIVE' ? (
              <div className="mt-5 border-t pt-5">
                <label className="flex min-h-12 items-center gap-3 font-normal">
                  <input
                    type="checkbox"
                    className="h-6 min-h-0 w-6"
                    checked={confirmClose}
                    onChange={(event) => setConfirmClose(event.target.checked)}
                  />
                  Mark unrecorded students absent and close the session
                </label>
                <button
                  className="secondary mt-3"
                  disabled={
                    !confirmClose || busy || pending || operationBusy || pendingDisputes > 0
                  }
                  onClick={() => void finish()}
                >
                  Close attendance session
                </button>
              </div>
            ) : null}
          </section>
          {(view === 'review' || session.state === 'CLOSED') && (
            <AuditTrail events={events} session={session} />
          )}
          {manualOpen ? (
            <ManualEntryDialog
              keys={keys}
              session={session}
              attendance={attendance}
              onClose={() => setManualOpen(false)}
              onSaved={async (outcome) => {
                setResult(outcome);
                await refreshAfterSave();
              }}
            />
          ) : null}
        </>
      ) : null}
      {!session && !error ? <p role="status">Loading attendance records…</p> : null}
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
    </div>
  );
}
