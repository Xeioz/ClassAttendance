import { useState } from 'react';
import type { Session, VaultKeys } from '../../types';
import { readReportSnapshot } from '../../domain/reports';
import { exportExcel } from '../../utils/excel';
import { exportCSV } from '../../utils/csvExport';
import { errorMessage } from '../../utils/errors';

export function ExportModal({
  keys,
  session,
  auditCount,
}: {
  keys: VaultKeys;
  session: Session;
  auditCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(format: 'xlsx' | 'csv') {
    setBusy(true);
    setMessage('');
    try {
      const snapshot = await readReportSnapshot(keys, session.id);
      if (format === 'xlsx')
        await exportExcel(snapshot.session, snapshot.attendance, snapshot.audit);
      else exportCSV(snapshot.session, snapshot.attendance);
      setMessage(
        `Download requested for the entire ${snapshot.session.course} / ${snapshot.session.section} session: ${snapshot.session.roster.length} students, ${snapshot.session.state === 'ACTIVE' ? 'in progress, not final' : 'closed / reconciled'}. Check browser downloads. Exported records contain personal data.`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="mb-2 max-w-xl text-sm">
        Export entire selected session: {session.course} / {session.section} ·{' '}
        {session.roster.length} students ·{' '}
        {session.state === 'ACTIVE' ? 'In progress — not final' : 'Closed / reconciled'}. Roster
        search does not filter downloads. Excel includes all {auditCount} audit events; CSV contains
        attendance only.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="secondary" disabled={busy} onClick={() => void run('xlsx')}>
          {busy ? 'Preparing…' : 'Download Excel report'}
        </button>
        <button className="secondary" disabled={busy} onClick={() => void run('csv')}>
          Download CSV
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
