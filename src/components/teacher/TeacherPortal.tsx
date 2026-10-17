import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { db, requestPersistence } from '../../db/db';
import { unlockVault } from '../../db/vault';
import {
  closeSession,
  correctAttendance,
  getAttendance,
  listSessions,
  listStudents,
  recordAttendance,
} from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import { enableAudio, feedback } from '../../utils/feedback';
import type {
  AttendancePrivate,
  AttendanceStatus,
  ScanResult,
  Session,
  Student,
  VaultKeys,
} from '../../types';
import { AccessibleHUD } from '../common/AccessibleHUD';
import { BackupControls } from './BackupControls';
import { ExportModal } from './ExportModal';
import { RosterUpload } from './RosterUpload';
import { ScannerView } from './ScannerView';
import { SessionForm } from './SessionForm';

export function TeacherPortal({ onActive }: { onActive: (active: boolean) => void }) {
  const [keys, setKeys] = useState<VaultKeys>();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [exists, setExists] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [persistence, setPersistence] = useState('');
  useEffect(() => {
    void db.meta
      .get('vault')
      .then((value) => setExists(Boolean(value)))
      .catch((error) => setError(errorMessage(error)));
  }, [keys]);
  const lock = useCallback(() => {
    setKeys(undefined);
    onActive(false);
  }, [onActive]);
  useEffect(() => {
    if (!keys) return;
    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(lock, 15 * 60_000);
    };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('pagehide', lock);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('pagehide', lock);
    };
  }, [keys, lock]);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const hasVault = Boolean(await db.meta.get('vault'));
      setExists(hasVault);
      if (!hasVault && pin !== confirmation)
        throw new Error('The new PIN and confirmation must match.');
      const unlocked = await unlockVault(pin);
      setKeys(unlocked);
      setPin('');
      setConfirmation('');
      setPersistence(await requestPersistence());
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return keys ? (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{persistence}</p>
        <button className="secondary" onClick={lock}>
          Lock teacher records
        </button>
      </div>
      <TeacherWorkspace keys={keys} onActive={onActive} />
      <BackupControls keys={keys} />
    </>
  ) : (
    <div className="mx-auto grid max-w-xl gap-5">
      <form className="card grid gap-5" onSubmit={unlock}>
        <div>
          <p className="eyebrow">Teacher workspace</p>
          <h2 className="mt-2 text-2xl">
            {exists === false ? 'Protect your local records' : 'Unlock local records'}
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Records stay in this browser. Your Master PIN is never sent to a server.
          </p>
        </div>
        <p className="notice">
          A short numeric PIN has limited resistance to offline guessing. Use a long random PIN,
          protect this device, and keep encrypted backups. Encryption alone does not establish legal
          compliance.
        </p>
        <label>
          Master PIN (6–12 digits)
          <input
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
            Confirm new PIN
            <input
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
          {busy ? 'Unlocking…' : exists ? 'Unlock teacher workspace' : 'Create encrypted workspace'}
        </button>
        {error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
      <BackupControls />
    </div>
  );
}

function TeacherWorkspace({
  keys,
  onActive,
}: {
  keys: VaultKeys;
  onActive: (active: boolean) => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [attendance, setAttendance] = useState<Map<string, AttendancePrivate>>(new Map());
  const [result, setResult] = useState<ScanResult>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [query, setQuery] = useState('');
  const [manualId, setManualId] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [correction, setCorrection] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const session = sessions.find((item) => item.id === selectedId);
  const active = sessions.some((item) => item.state === 'ACTIVE');
  const refresh = useCallback(
    async (preferredId?: string) => {
      const [roster, history] = await Promise.all([listStudents(keys), listSessions(keys)]);
      history.sort((a, b) => b.startsAt - a.startsAt);
      setStudents(roster);
      setSessions(history);
      const selected =
        history.find((item) => item.id === (preferredId ?? selectedId)) ??
        history.find((item) => item.state === 'ACTIVE') ??
        history[0];
      setSelectedId(selected?.id ?? '');
      setAttendance(selected ? await getAttendance(keys, selected.id) : new Map());
    },
    [keys, selectedId],
  );
  useEffect(() => {
    let disposed = false;
    void refresh().catch((error) => {
      if (!disposed) setError(errorMessage(error));
    });
    return () => {
      disposed = true;
    };
  }, [refresh]);
  useEffect(() => {
    onActive(active || pending || busy);
    return () => onActive(false);
  }, [active, pending, busy, onActive]);
  useEffect(() => {
    const handleFocus = () => {
      void refresh().catch((error) => setError(errorMessage(error)));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);
  async function scan(raw: string) {
    if (!session) return;
    try {
      const outcome = await recordAttendance(keys, session.id, { raw });
      setResult(outcome);
      if (outcome.kind !== 'duplicate') feedback(outcome.kind === 'valid', sound);
      try {
        await refresh();
      } catch (error) {
        setError(`Scan committed, but the dashboard could not refresh: ${errorMessage(error)}`);
      }
    } catch (error) {
      setResult({ kind: 'error', title: 'Not saved', detail: errorMessage(error) });
      feedback(false, sound);
    }
  }
  async function manual(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    const student = session.roster.find((item) => item.token === manualId);
    if (!student) {
      setError('Choose a student from the session roster.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (correction || session.state === 'CLOSED') {
        await correctAttendance(keys, session.id, student, status, reason);
        setResult({
          kind: 'valid',
          title: 'Correction saved',
          detail: `${student.name} · ${status}`,
        });
      } else setResult(await recordAttendance(keys, session.id, { student, reason }));
      setReason('');
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (!session || !confirmClose) return;
    setBusy(true);
    setError('');
    try {
      await closeSession(keys, session);
      setConfirmClose(false);
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const entry of attendance.values()) counts[entry.status]++;
  const filtered =
    session?.roster.filter((student) =>
      `${student.name} ${student.id}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <div className="mb-5 grid gap-5">
      <RosterUpload keys={keys} onSaved={refresh} disabled={active || busy || pending} />
      {!active ? (
        <SessionForm
          keys={keys}
          sections={[...new Set(students.map((item) => item.section))].sort()}
          onCreated={async (created) => {
            await refresh(created.id);
          }}
        />
      ) : null}
      {sessions.length ? (
        <label className="max-w-lg">
          Session history
          <select
            value={selectedId}
            disabled={busy || pending}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setResult(undefined);
              setManualId('');
              setConfirmClose(false);
            }}
          >
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.course} · {item.section} · {new Date(item.startsAt).toLocaleString()} ·{' '}
                {item.state}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {session ? (
        <>
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{session.state} session</p>
                <h2 className="mt-2 text-2xl">
                  {session.course}{' '}
                  <span className="font-normal text-slate-500">/ {session.section}</span>
                </h2>
                <p className="mt-2 text-sm">
                  Room challenge: <strong className="font-mono text-lg">{session.roomPin}</strong> ·{' '}
                  {session.graceMinutes} minute grace period
                </p>
              </div>
              <ExportModal session={session} attendance={attendance} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
              {[
                ['Enrolled', session.roster.length],
                ['Present', counts.PRESENT],
                ['Late', counts.LATE],
                ['Not yet recorded', session.roster.length - attendance.size],
                ['Absent', counts.ABSENT],
                ['Excused', counts.EXCUSED],
              ].map(([label, value]) => (
                <div className="rounded-xl bg-paper p-4" key={label}>
                  <p className="text-xs font-semibold text-slate-600">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="card grid gap-5">
              <h2 className="text-xl">Record attendance</h2>
              <AccessibleHUD result={result} />
              {pending ? <p role="status">Saving scan…</p> : null}
              {session.state === 'ACTIVE' ? (
                <>
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
                  <ScannerView key={session.id} onScan={scan} onPending={setPending} />
                </>
              ) : (
                <p className="text-sm">
                  Session closed. Review records or make a reasoned correction below.
                </p>
              )}
            </section>
            <section className="card">
              <h2 className="text-xl">Manual check-in & corrections</h2>
              <form onSubmit={manual} className="mt-4 grid gap-4">
                <label>
                  Search students
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name or student ID"
                  />
                </label>
                <label>
                  Student
                  <select
                    value={manualId}
                    onChange={(event) => setManualId(event.target.value)}
                    required
                  >
                    <option value="">Select a student</option>
                    {filtered.map((student) => (
                      <option key={student.token} value={student.token}>
                        {student.name} · {student.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-12 items-center gap-3 font-normal">
                  <input
                    type="checkbox"
                    className="h-6 min-h-0 w-6"
                    checked={correction || session.state === 'CLOSED'}
                    disabled={session.state === 'CLOSED'}
                    onChange={(event) => setCorrection(event.target.checked)}
                  />
                  Correct attendance status
                </label>
                {correction || session.state === 'CLOSED' ? (
                  <label>
                    New status
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
                    >
                      {['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <button className="btn" disabled={busy || pending || !manualId}>
                  {busy ? 'Saving…' : 'Save manual entry'}
                </button>
              </form>
            </section>
          </div>
          <section className="card">
            <h2 className="text-xl">Attendance roster</h2>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Attendance for the selected session</caption>
                <thead>
                  <tr>
                    {['Student ID', 'Official name', 'Status', 'Recorded'].map((label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => {
                    const entry = attendance.get(student.token);
                    return (
                      <tr key={student.token} className="border-t">
                        <td className="whitespace-nowrap p-3 font-mono">{student.id}</td>
                        <td className="p-3">{student.name}</td>
                        <td className="p-3 font-semibold">{entry?.status ?? 'Not yet recorded'}</td>
                        <td className="p-3">
                          {entry ? new Date(entry.at).toLocaleTimeString() : '—'}
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
                  Mark remaining unrecorded students absent and close this session
                </label>
                <button
                  className="secondary mt-3"
                  disabled={!confirmClose || busy || pending}
                  onClick={() => void finish()}
                >
                  Close attendance session
                </button>
              </div>
            ) : null}
          </section>
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
