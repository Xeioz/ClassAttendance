import { useEffect, useRef, useState, type FormEvent } from 'react';
import { correctAttendance, recordAttendance } from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import type {
  AttendancePrivate,
  AttendanceStatus,
  ScanResult,
  Session,
  VaultKeys,
} from '../../types';

export function ManualEntryDialog({
  keys,
  session,
  attendance,
  onClose,
  onSaved,
}: {
  keys: VaultKeys;
  session: Session;
  attendance: Map<string, AttendancePrivate>;
  onClose: () => void;
  onSaved: (result: ScanResult) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [studentToken, setStudentToken] = useState('');
  const [status, setStatus] = useState<'AUTO' | AttendanceStatus>('AUTO');
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const matches = session.roster.filter((student) =>
    `${student.displayId ?? ''} ${student.id} ${student.name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = session.roster.find((student) => student.token === studentToken);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      let result: ScanResult;
      if (correction) {
        if (status === 'AUTO') throw new Error('Choose the corrected status.');
        await correctAttendance(keys, session.id, selected, status, reason);
        result = {
          kind: 'valid',
          title: 'Correction saved',
          detail: `${selected.name} · ${status}`,
        };
      } else
        result = await recordAttendance(keys, session.id, {
          student: selected,
          reason,
          ...(status !== 'AUTO' && status !== 'ABSENT' ? { status } : {}),
        });
      await onSaved(result);
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="manual-title"
      className="m-auto max-h-[90vh] w-[min(95vw,36rem)] overflow-auto rounded-2xl p-6 text-ink backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="manual-title" className="text-xl">
          Manual attendance
        </h2>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="my-4 text-sm text-slate-600">
        {session.course} / {session.section} · {session.state}. Verify identity before recording or
        correcting attendance.
      </p>
      <form onSubmit={save} className="grid gap-4">
        <label>
          Search students
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Enrolled student
          <select
            value={studentToken}
            onChange={(event) => setStudentToken(event.target.value)}
            required
          >
            <option value="">Select student</option>
            {matches.map((student) => (
              <option key={student.token} value={student.token}>
                {student.name} · {student.displayId ?? student.id}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="text-sm">
            Current status:{' '}
            <strong>{attendance.get(selected.token)?.status ?? 'Not yet recorded'}</strong>
          </p>
        ) : null}
        <label className="flex min-h-12 items-center gap-3 font-normal">
          <input
            type="checkbox"
            className="h-6 min-h-0 w-6"
            checked={correction}
            onChange={(event) => {
              setCorrection(event.target.checked);
              setStatus(event.target.checked ? 'PRESENT' : 'AUTO');
            }}
          />
          Correct an existing record
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {!correction ? <option value="AUTO">Automatic present / late</option> : null}
            {['PRESENT', 'LATE', 'EXCUSED', ...(correction ? ['ABSENT'] : [])].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Required reason
          <textarea
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
        <button className="btn" disabled={busy || !selected || session.state !== 'ACTIVE'}>
          {busy ? 'Saving…' : 'Save attendance'}
        </button>
        {error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
    </dialog>
  );
}
