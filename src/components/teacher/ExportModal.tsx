import { useState } from 'react';
import type { AttendancePrivate, Session } from '../../types';
import { exportExcel } from '../../utils/excel';
import { errorMessage } from '../../utils/errors';

export function ExportModal({
  session,
  attendance,
}: {
  session: Session;
  attendance: Map<string, AttendancePrivate>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run() {
    setBusy(true);
    setMessage('');
    try {
      await exportExcel(session, attendance);
      setMessage(
        'Download requested. Check your browser downloads. The workbook contains personal data.',
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? 'Preparing…' : 'Download Excel report'}
      </button>
      {message ? (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
