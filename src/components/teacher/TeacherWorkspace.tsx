import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeSession,
  listSessions,
  listStudents,
  recordAttendance,
  reopenSession,
} from '../../domain/attendance';
import { unresolvedDisputes } from '../../domain/audit';
import { attendanceSummary, readReportSnapshot } from '../../domain/reports';
import { errorMessage } from '../../utils/errors';
import { t } from '../../i18n';
import { enableAudio, feedback } from '../../utils/feedback';
import type {
  AttendancePrivate,
  AuditEntry,
  ScanResult,
  Session,
  Student,
  VaultKeys,
} from '../../types';
import { AccessibleHUD } from '../common/AccessibleHUD';
import { AuditTrail } from './AuditTrail';
import { DisputePanel } from './DisputePanel';
import { ExportModal } from './ExportModal';
import { ManualEntryDialog } from './ManualEntryDialog';
import { RosterUpload } from './RosterUpload';
import { ScannerView } from './ScannerView';
import { SessionForm } from './SessionForm';
import { usePagination } from '../../hooks/pagination';
import { Pagination } from '../common/Pagination';

export function TeacherWorkspace({
  keys,
  onActive,
}: {
  keys: VaultKeys;
  onActive: (active: boolean) => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [session, setSession] = useState<Session>();
  const [attendance, setAttendance] = useState<Map<string, AttendancePrivate>>(new Map());
  const [events, setEvents] = useState<AuditEntry[]>([]);
  const [result, setResult] = useState<ScanResult>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [query, setQuery] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [rosterReview, setRosterReview] = useState({
    pending: false,
    blockingIssues: 0,
    changes: 0,
  });
  const [disputeReviewOpen, setDisputeReviewOpen] = useState(false);
  const scanGeneration = useRef(0);
  const disputeReviewState = useRef(false);
  const onDisputeReviewChange = useCallback((reviewing: boolean) => {
    // Mount/refresh can report the existing idle state after a fast first scan.
    // Only an actual review transition may invalidate a scan result.
    if (disputeReviewState.current === reviewing) return;
    disputeReviewState.current = reviewing;
    // A scan begun before opening/cancelling review may finish saving, but its
    // result must not become a fresh review target after that transition.
    scanGeneration.current++;
    setDisputeReviewOpen(reviewing);
    if (!reviewing) setResult(undefined);
  }, []);
  const [confirmClose, setConfirmClose] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const sequence = useRef(0);
  const currentId = useRef(selectedId);
  currentId.current = selectedId;
  const active = sessions.some((item) => item.state === 'ACTIVE');
  const refresh = useCallback(
    async (preferredId?: string) => {
      const request = ++sequence.current;
      const [roster, history] = await Promise.all([listStudents(keys), listSessions(keys)]);
      history.sort((a, b) => b.startsAt - a.startsAt);
      const selected =
        history.find((item) => item.id === (preferredId ?? selectedId)) ??
        history.find((item) => item.state === 'ACTIVE') ??
        history[0];
      const snapshot = selected ? await readReportSnapshot(keys, selected.id) : undefined;
      if (request !== sequence.current) return;
      setStudents(roster);
      setSessions(history);
      setSelectedId(selected?.id ?? '');
      setSession(snapshot?.session);
      setAttendance(snapshot?.attendance ?? new Map());
      setEvents(snapshot?.audit ?? []);
    },
    [keys, selectedId],
  );
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
        !disputeReviewOpen
      ) {
        event.preventDefault();
        setManualOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [session?.state, pending, busy, disputeReviewOpen]);
  async function refreshAfterSave() {
    try {
      if (!selectedId) return;
      const snapshot = await readReportSnapshot(keys, selectedId);
      setSessions((history) =>
        history.map((item) => (item.id === snapshot.session.id ? snapshot.session : item)),
      );
      if (currentId.current !== snapshot.session.id) return;
      setSession(snapshot.session);
      setAttendance(snapshot.attendance);
      setEvents(snapshot.audit);
    } catch (error) {
      setError(t('workspace.savedRefreshFailed', { error: errorMessage(error) }));
    }
  }
  function reviewActiveSession() {
    const current = sessions.find((item) => item.state === 'ACTIVE');
    if (!current) return;
    void refresh(current.id)
      .then(() => requestAnimationFrame(() => document.getElementById('active-session')?.focus()))
      .catch((error) => setError(errorMessage(error)));
  }
  async function scan(raw: string) {
    if (!session) return;
    const scanSessionId = session.id;
    const generation = scanGeneration.current;
    try {
      const outcome = await recordAttendance(keys, scanSessionId, { raw });
      if (currentId.current === scanSessionId && generation === scanGeneration.current)
        setResult(outcome);
      if (outcome.kind !== 'duplicate') feedback(outcome.kind === 'valid', sound);
      await refreshAfterSave();
    } catch (error) {
      if (currentId.current === scanSessionId && generation === scanGeneration.current)
        setResult({ kind: 'error', title: t('scan.notSaved'), detail: errorMessage(error) });
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
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const summary = session ? attendanceSummary(session, attendance) : undefined;
  const pendingDisputes = unresolvedDisputes(events).length;
  const filtered =
    session?.roster.filter((student) =>
      `${student.name} ${student.id} ${student.displayId ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ) ?? [];
  const rosterPagination = usePagination(filtered, 50, JSON.stringify([selectedId, query]));
  return (
    <div className="mb-5 grid gap-5">
      <RosterUpload
        keys={keys}
        onSaved={refresh}
        disabled={active || busy || pending}
        onReviewStateChange={setRosterReview}
      />
      <details open={!active}>
        <summary className="mb-3 min-h-12 cursor-pointer rounded-lg px-2 py-3 font-semibold">
          {t('workspace.preparation')}
        </summary>
        <SessionForm
          keys={keys}
          sections={[...new Set(students.map((item) => item.section))].sort()}
          students={students}
          activeSession={sessions.find((item) => item.state === 'ACTIVE')}
          rosterReviewPending={rosterReview.pending}
          rosterReviewIssues={rosterReview.blockingIssues}
          onRosterChanged={refresh}
          onReviewActiveSession={reviewActiveSession}
          onCreated={async (created) => {
            setResult(undefined);
            await refresh(created.id);
          }}
        />
      </details>
      {sessions.length ? (
        <label className="max-w-lg">
          {t('workspace.history')}
          <select
            value={selectedId}
            disabled={busy || pending || manualOpen || disputeReviewOpen}
            onChange={(event) => {
              sequence.current++;
              setSelectedId(event.target.value);
              setSession(undefined);
              setResult(undefined);
              setConfirmClose(false);
              setReopenReason('');
            }}
          >
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {t('workspace.historyOption', {
                  course: item.course,
                  section: item.section,
                  time: new Date(item.startsAt).toLocaleString(),
                  state: t(`session.${item.state}`),
                })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {session && summary ? (
        <>
          <section className="card" id="active-session" tabIndex={-1}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {session.state === 'CLOSED' ? t('workspace.closed') : t('workspace.active')}
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
                  {t('workspace.challenge')}{' '}
                  <strong className="font-mono text-lg">{session.roomPin}</strong> ·{' '}
                  {t('workspace.grace', { minutes: session.graceMinutes })}
                </p>
              </div>
              <ExportModal keys={keys} session={session} auditCount={events.length} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
              {[
                [t('workspace.enrolled'), summary.total],
                [t('workspace.present'), summary.counts.PRESENT],
                [t('workspace.late'), summary.counts.LATE],
                [t('manual.notRecorded'), summary.counts.PENDING],
                [t('workspace.absent'), summary.counts.ABSENT],
                [t('workspace.excused'), summary.counts.EXCUSED],
              ].map(([label, value]) => (
                <div className="rounded-xl bg-paper p-4" key={label}>
                  <p className="text-xs font-semibold text-slate-600">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              {t('workspace.rate', {
                rate: (summary.rate * 100).toFixed(1),
                disputes: pendingDisputes,
              })}
            </p>
          </section>
          {session.state === 'ACTIVE' ? (
            <section className="card grid gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">{t('workspace.record')}</h2>
                <button
                  className="secondary"
                  disabled={pending || busy || disputeReviewOpen}
                  onClick={() => setManualOpen(true)}
                >
                  {t('workspace.manual')}
                </button>
              </div>
              <AccessibleHUD result={result} processing={pending} />
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
                {sound ? t('workspace.soundOn') : t('workspace.soundOff')}
              </button>
              <ScannerView
                key={session.id}
                onScan={scan}
                onPending={setPending}
                paused={manualOpen || disputeReviewOpen}
              />
              {manualOpen ? <p className="text-sm">{t('workspace.manualPaused')}</p> : null}
            </section>
          ) : (
            <section className="card">
              <h2 className="text-xl">{t('workspace.reopenTitle')}</h2>
              <p className="my-3 text-sm text-slate-600">{t('workspace.reopenDescription')}</p>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void reopen();
                }}
              >
                <label>
                  {t('workspace.reopenReason')}
                  <textarea
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <button className="secondary justify-self-start" disabled={busy || active}>
                  {t('workspace.reopen')}
                </button>
              </form>
            </section>
          )}
          <DisputePanel
            key={session.id}
            keys={keys}
            session={session}
            events={events}
            candidate={result}
            onChanged={refreshAfterSave}
            onReviewChange={onDisputeReviewChange}
          />
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl">{t('workspace.roster')}</h2>
              <label>
                {t('workspace.search')}
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('workspace.searchPlaceholder')}
                />
              </label>
            </div>
            <Pagination
              page={rosterPagination.page}
              pageSize={50}
              count={filtered.length}
              label={t('pagination.roster')}
              onPage={rosterPagination.setPage}
            />
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t('workspace.caption')}</caption>
                <thead>
                  <tr>
                    {[
                      'student.id',
                      'workspace.officialName',
                      'manual.status',
                      'workspace.firstRecorded',
                    ].map((label) => (
                      <th scope="col" key={label} className="p-3">
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rosterPagination.visible.map((student) => {
                    const entry = attendance.get(student.token);
                    return (
                      <tr key={student.token} className="border-t">
                        <td className="whitespace-nowrap p-3 font-mono">
                          {student.displayId ?? student.id}
                        </td>
                        <td className="p-3">{student.name}</td>
                        <td className="p-3 font-semibold">
                          {entry ? t(`status.${entry.status}`) : t('manual.notRecorded')}
                        </td>
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
            {session.state === 'ACTIVE' ? (
              <div className="mt-5 border-t pt-5">
                <label className="flex min-h-12 items-center gap-3 font-normal">
                  <input
                    type="checkbox"
                    className="h-6 min-h-0 w-6"
                    checked={confirmClose}
                    onChange={(event) => setConfirmClose(event.target.checked)}
                  />
                  {t('workspace.closeConfirm')}
                </label>
                <button
                  className="secondary mt-3"
                  disabled={
                    !confirmClose || busy || pending || disputeReviewOpen || pendingDisputes > 0
                  }
                  onClick={() => void finish()}
                >
                  {t('workspace.close')}
                </button>
              </div>
            ) : null}
          </section>
          <AuditTrail events={events} session={session} />
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
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : null}
    </div>
  );
}
