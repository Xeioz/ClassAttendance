import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
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
  const [returnFocus] = useState(() => document.activeElement);
  const studentInput = useRef<HTMLSelectElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const statusInput = useRef<HTMLSelectElement>(null);
  const id = useId();
  const [query, setQuery] = useState('');
  const [studentToken, setStudentToken] = useState('');
  const [status, setStatus] = useState<'AUTO' | AttendanceStatus>('AUTO');
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'student' | 'reason' | 'status'>();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);
  const matches = session.roster.filter((student) =>
    `${student.displayId ?? ''} ${student.id} ${student.name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = session.roster.find((student) => student.token === studentToken);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setErrorField(undefined);
    if (!selected) {
      setError(t('manual.selectRequired'));
      setErrorField('student');
      studentInput.current?.focus();
      return;
    }
    if (correction && status === 'AUTO') {
      setError(t('manual.correctedStatusRequired'));
      setErrorField('status');
      statusInput.current?.focus();
      return;
    }
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      setError(t('manual.reasonInvalid'));
      setErrorField('reason');
      reasonInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      let result: ScanResult;
      if (correction) {
        if (status === 'AUTO') throw new Error(t('manual.correctedStatusRequired'));
        await correctAttendance(keys, session.id, selected, status, reason);
        result = {
          kind: 'valid',
          title: t('manual.corrected'),
          detail: `${selected.name} · ${t(`status.${status}`)}`,
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
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-context`}
      className="m-auto max-h-[90vh] w-[min(95vw,36rem)] overflow-auto rounded-2xl p-6 text-ink backdrop:bg-slate-950/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl">
          {t('manual.title')}
        </h2>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <p id={`${id}-context`} className="my-4 text-sm text-slate-600">
        {t('manual.context', {
          course: session.course,
          section: session.section,
          state: session.state,
        })}
      </p>
      <form noValidate onSubmit={save} className="grid gap-4" aria-busy={busy}>
        <label>
          {t('manual.search')}
          <input
            autoFocus
            type="search"
            disabled={busy}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!matches.length ? <p className="text-sm">{t('manual.noMatches')}</p> : null}
        <label>
          {t('manual.student')}
          <select
            ref={studentInput}
            disabled={busy}
            aria-invalid={errorField === 'student'}
            aria-describedby={errorField === 'student' ? `${id}-error` : undefined}
            value={studentToken}
            onChange={(event) => setStudentToken(event.target.value)}
            required
          >
            <option value="">{t('manual.select')}</option>
            {selected && !matches.includes(selected) ? (
              <option value={selected.token}>
                {selected.name} · {selected.displayId ?? selected.id}
              </option>
            ) : null}
            {matches.map((student) => (
              <option key={student.token} value={student.token}>
                {student.name} · {student.displayId ?? student.id}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="text-sm">
            {t('manual.currentStatus')}{' '}
            <strong>
              {attendance.has(selected.token)
                ? t(`status.${attendance.get(selected.token)!.status}`)
                : t('manual.notRecorded')}
            </strong>
          </p>
        ) : null}
        <label className="flex min-h-12 items-center gap-3 font-normal">
          <input
            type="checkbox"
            className="h-6 min-h-0 w-6"
            checked={correction}
            disabled={busy}
            onChange={(event) => {
              setCorrection(event.target.checked);
              setStatus(event.target.checked ? 'PRESENT' : 'AUTO');
            }}
          />
          {t('manual.correct')}
        </label>
        <label>
          {t('manual.status')}
          <select
            ref={statusInput}
            disabled={busy}
            aria-invalid={errorField === 'status'}
            aria-describedby={errorField === 'status' ? `${id}-error` : undefined}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {!correction ? <option value="AUTO">{t('manual.auto')}</option> : null}
            {['PRESENT', 'LATE', 'EXCUSED', ...(correction ? ['ABSENT'] : [])].map((item) => (
              <option key={item} value={item}>
                {t(`status.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('manual.reason')}
          <textarea
            ref={reasonInput}
            disabled={busy}
            aria-invalid={errorField === 'reason'}
            aria-describedby={`${id}-reason-hint${errorField === 'reason' ? ` ${id}-error` : ''}`}
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </label>
        <p id={`${id}-reason-hint`} className="text-sm text-slate-600">
          {t('manual.reasonHint')}
        </p>
        <button className="btn" disabled={busy || session.state !== 'ACTIVE'}>
          {busy ? t('common.saving') : t('manual.save')}
        </button>
        {error ? (
          <p id={`${id}-error`} role="alert" className="notice">
            {error}
          </p>
        ) : null}
      </form>
    </dialog>
  );
}
