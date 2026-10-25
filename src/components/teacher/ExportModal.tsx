import { useState } from 'react';
import type { Session, VaultKeys } from '../../types';
import { readReportSnapshot } from '../../domain/reports';
import { exportExcel } from '../../utils/excel';
import { exportCSV } from '../../utils/csvExport';
import { errorMessage } from '../../utils/errors';
import { t } from '../../i18n';

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
        t('export.requested', {
          course: snapshot.session.course,
          section: snapshot.session.section,
          count: snapshot.session.roster.length,
          state:
            snapshot.session.state === 'ACTIVE' ? t('export.activeRequested') : t('export.closed'),
        }),
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
        {t('export.scope', {
          course: session.course,
          section: session.section,
          count: session.roster.length,
          state: session.state === 'ACTIVE' ? t('export.active') : t('export.closedTitle'),
          auditCount,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="secondary" disabled={busy} onClick={() => void run('xlsx')}>
          {busy ? t('export.preparing') : t('export.excel')}
        </button>
        <button className="secondary" disabled={busy} onClick={() => void run('csv')}>
          {t('export.csv')}
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
