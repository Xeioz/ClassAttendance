import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { buildExcelReport, exportExcel } from '../src/utils/excel';
import { attendanceCSV } from '../src/utils/csvExport';
import { downloadFile } from '../src/utils/download';
import { exportFixture, verifyExport } from '../scripts/qa-export-contract';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('Excel reporting schema 2', () => {
  it.each([0, 1, 45])(
    'serializes and reopens complete values, types and formatting for %i rows',
    async (size) => {
      const fixture = exportFixture(size);
      const sourceBefore = JSON.stringify({
        session: fixture.session,
        entries: [...fixture.attendance],
        audit: fixture.audit,
      });
      await exportExcel(fixture.session, fixture.attendance, fixture.audit);
      const [blob, filename] = vi.mocked(downloadFile).mock.calls[0];
      expect(filename).toMatch(/QA101_A_Attendance_.*\.xlsx/);
      const result = await verifyExport(
        await blob.arrayBuffer(),
        attendanceCSV(fixture.session, fixture.attendance),
        fixture,
      );
      expect(result.records).toBe(size);
      expect(
        JSON.stringify({
          session: fixture.session,
          entries: [...fixture.attendance],
          audit: fixture.audit,
        }),
      ).toBe(sourceBefore);
    },
  );

  it('preserves unknown scanned identities and supports canonical-only historical roster IDs', async () => {
    const fixture = exportFixture(1);
    delete fixture.session.roster[0].displayId;
    fixture.audit.push({
      eventId: 'unknown',
      sessionId: fixture.session.id,
      action: 'UNLISTED_SCAN',
      at: 0,
      studentId: '00999',
      performedBy: 'TEACHER_PIN',
      reason: '=untrusted text',
    });
    const bytes = await buildExcelReport(fixture.session, fixture.attendance, fixture.audit);
    const workbook = XLSX.read(bytes, { type: 'array' });
    expect(workbook.Sheets.Attendance.A2.v).toBe(fixture.session.roster[0].id);
    expect(workbook.Sheets['Audit trail'].D3.v).toBe('00999');
    expect(workbook.Sheets['Audit trail'].L3.v).toBe('00999');
    expect(workbook.Sheets['Audit trail'].C3.v).toBe('1970-01-01T00:00:00.000Z');
    expect(workbook.Sheets['Audit trail'].K3.v).toBe('=untrusted text');
    expect(workbook.Sheets['Audit trail'].K3.f).toBeUndefined();
    expect(workbook.Sheets['Audit trail'].K3.t).toBe('s');
  });
});
