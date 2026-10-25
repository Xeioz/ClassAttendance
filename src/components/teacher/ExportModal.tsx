import { useState } from 'react';
import type { VaultKeys } from '../../types';
import { readReportSnapshot } from '../../domain/reports';
import { exportExcel } from '../../utils/excel';
import { exportCSV } from '../../utils/csvExport';
import { errorMessage } from '../../utils/errors';

export function ExportModal({ keys, sessionId }: { keys: VaultKeys; sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(format: 'xlsx' | 'csv') {
    setBusy(true);
    setMessage('');
    try {
      const snapshot = await readReportSnapshot(keys, sessionId);
      if (format === 'xlsx')
        await exportExcel(snapshot.session, snapshot.attendance, snapshot.audit);
      else exportCSV(snapshot.session, snapshot.attendance);
      setMessage(
        'Download requested. Check browser downloads. Exported records contain personal data.',
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
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
