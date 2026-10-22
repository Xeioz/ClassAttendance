import type { AttendancePrivate, AuditEntry, Session } from '../types';
import { attendanceSummary, recordedTime, reportFilename, sessionDate } from '../domain/reports';
import { downloadFile } from './download';
import type { Row, Worksheet } from 'exceljs';

export const EXCEL_SCHEMA_VERSION = 2;
export const ATTENDANCE_HEADER_ROW = 1;
const attendanceWidths = [22, 34, 20, 24, 28, 28, 14, 50, 24];
const auditWidths = [38, 25, 28, 24, 18, 18, 28, 28, 38, 18, 55, 24];

function formatRow(row: Row, widths: number[], header = false): void {
  let lines = 1;
  row.eachCell({ includeEmpty: true }, (cell, column) => {
    cell.font = {
      name: 'Calibri',
      size: 11,
      ...(header ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}),
    };
    cell.alignment = { vertical: 'top', wrapText: true };
    if (typeof cell.value === 'string') {
      cell.numFmt = '@';
      const width = widths[column - 1] ?? 30;
      // Explicit heights retain multiline content when the viewer does not auto-fit imported rows.
      lines = Math.max(
        lines,
        cell.value
          .split(/\r?\n/)
          .reduce(
            (sum, line) => sum + Math.max(1, Math.ceil([...line].length / Math.max(1, width - 4))),
            0,
          ),
      );
    }
    if (header) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B32' } };
  });
  row.height = Math.min(409, Math.max(header ? 32 : 22, lines * 16 + 6));
}
function tableSheet(sheet: Worksheet, widths: number[], headerRow: number, rowCount: number): void {
  sheet.columns = widths.map((width) => ({ width }));
  sheet.views = [
    {
      state: 'frozen',
      xSplit: sheet.name === 'Attendance' ? 2 : 0,
      ySplit: headerRow,
      topLeftCell: sheet.name === 'Attendance' ? `C${headerRow + 1}` : `A${headerRow + 1}`,
    },
  ];
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + rowCount, column: widths.length },
  };
  sheet.eachRow((row) => formatRow(row, widths, row.number === headerRow));
}

/** Build the same bytes downloaded by the application; exported for repeatable verification. */
export async function buildExcelReport(
  session: Session,
  attendance: Map<string, AttendancePrivate>,
  audit: AuditEntry[] = [],
): Promise<ArrayBuffer> {
  // ExcelJS persists freeze panes, wrapping, row heights and styles in the actual XLSX archive.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Attendance Desk';
  workbook.title = 'Full selected session attendance report';
  const { total, counts, rate } = attendanceSummary(session, attendance);
  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    [session.institution || 'INSTITUTIONAL ATTENDANCE REPORT'],
    ['Course', session.course, 'Subject', session.subject ?? ''],
    ['Section', session.section, 'Room', session.room ?? ''],
    ['Class date', sessionDate(session), 'Timezone', session.timezone ?? 'Asia/Manila'],
    [
      'Start (UTC)',
      new Date(session.startsAt).toISOString(),
      'Grace minutes',
      session.graceMinutes,
    ],
    [
      'Session',
      session.id,
      'State',
      session.state === 'ACTIVE' ? 'IN PROGRESS - NOT FINAL' : 'CLOSED / RECONCILED',
    ],
    [
      'Closed (UTC)',
      session.closedAt === undefined ? '' : new Date(session.closedAt).toISOString(),
    ],
    ['Export scope', `Entire selected session: ${total} students; ${audit.length} audit events`],
    ['ATTENDANCE SUMMARY', 'Count', 'Share of enrolled'],
    ['Enrolled', total, total ? 1 : 0],
    ...(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'PENDING'] as const).map((status) => [
      status === 'PENDING' ? 'Not yet recorded' : status,
      counts[status],
      total ? counts[status] / total : 0,
    ]),
    ['Attendance rate (present + late / enrolled)', rate],
    ['Export schema', EXCEL_SCHEMA_VERSION, 'ID mapping and field definitions: Report info'],
  ]);
  summary.columns = [48, 58, 32, 40].map((width) => ({ width }));
  summary.eachRow((row) => formatRow(row, [48, 58, 32, 40], row.number === 9));
  summary.mergeCells('A1:D1');
  summary.getCell('A1').font = {
    name: 'Calibri',
    size: 16,
    bold: true,
    color: { argb: 'FF123B32' },
  };
  summary.getRow(1).height = 34;
  for (let row = 10; row <= 15; row++) summary.getCell(`C${row}`).numFmt = '0.0%';
  summary.getCell('B16').numFmt = '0.0%';
  const sheet = workbook.addWorksheet('Attendance');
  sheet.addRows([
    [
      'Student ID (display)',
      'Official name',
      'Section',
      'Status',
      'First recorded (UTC)',
      'Last changed (UTC)',
      'Source',
      'Reason',
      'Student ID (canonical)',
    ],
    ...session.roster.map((student) => {
      const entry = attendance.get(student.token);
      return [
        student.displayId ?? student.id,
        student.name,
        student.section,
        entry?.status ?? 'NOT_YET_RECORDED',
        recordedTime(entry),
        entry ? new Date(entry.at).toISOString() : '',
        entry?.source ?? '',
        entry?.reason ?? '',
        student.id,
      ];
    }),
  ]);
  tableSheet(sheet, attendanceWidths, ATTENDANCE_HEADER_ROW, session.roster.length);

  const rosterByToken = new Map(session.roster.map((student) => [student.token, student]));
  const rosterById = new Map(session.roster.map((student) => [student.id, student]));
  const auditSheet = workbook.addWorksheet('Audit trail');
  auditSheet.addRow([
    'Event ID',
    'Action',
    'Event time (UTC)',
    'Student ID (canonical)',
    'Previous status',
    'New status',
    'First presentation (UTC)',
    'Second presentation (UTC)',
    'Dispute ID',
    'Local actor',
    'Reason',
    'Student ID (display)',
  ]);
  for (const event of audit) {
    const student =
      (event.studentToken ? rosterByToken.get(event.studentToken) : undefined) ??
      (event.studentId ? rosterById.get(event.studentId) : undefined);
    auditSheet.addRow([
      event.eventId,
      event.action,
      new Date(event.at).toISOString(),
      event.studentId ?? student?.id ?? '',
      event.previousStatus ?? '',
      event.newStatus ?? '',
      event.firstAt === undefined ? '' : new Date(event.firstAt).toISOString(),
      event.secondAt === undefined ? '' : new Date(event.secondAt).toISOString(),
      event.disputeId ?? '',
      event.performedBy,
      event.reason ?? '',
      student?.displayId ?? student?.id ?? event.studentId ?? '',
    ]);
  }
  tableSheet(auditSheet, auditWidths, 1, audit.length);

  const info = workbook.addWorksheet('Report info');
  info.addRows([
    ['Field', 'Definition'],
    ['Export schema', String(EXCEL_SCHEMA_VERSION)],
    [
      'Scope',
      'Every roster member and audit event in the selected session snapshot; screen search does not filter exports.',
    ],
    ['Session', session.id],
    ['State', session.state],
    ['Students', total],
    ['Audit events', audit.length],
    [
      'Student ID (display)',
      'Original official spelling when available; otherwise the canonical ID. Text preserves leading zeros.',
    ],
    [
      'Student ID (canonical)',
      'Normalized application ID. Use this explicit key to join Attendance column I with Audit trail column D within this session.',
    ],
    [
      'Unlisted events',
      'Scanned IDs may have no roster member. Their display ID falls back to the recorded scanned ID; no roster record is invented.',
    ],
    [
      'Compatibility',
      'Schema 2 moves metadata and summary to Summary. Attendance now has row-1 headers and data from row 2. Its first eight value columns and the first eleven Audit trail value columns retain their positions. ID headings are clarified and canonical/display columns are appended. CSV retains its existing 16 columns.',
    ],
    [
      'Timestamps',
      'ISO 8601 UTC text, not Excel date serials. Class date uses the saved session timezone.',
    ],
    [
      'Attendance rate',
      '(PRESENT + LATE) / all enrolled; excused students remain in the denominator.',
    ],
    [
      'First recorded (UTC)',
      'Blank for unrecorded and ABSENT entries under the existing contract. Original timestamps remain in audit history when recorded.',
    ],
    [
      'Spreadsheet safety',
      'User text is stored as text, including formula-like strings. This report contains no generated formulas.',
    ],
    [
      'Privacy',
      'Downloaded reports contain plaintext personal data. Handle and retain them according to institutional policy.',
    ],
  ]);
  tableSheet(info, [30, 100], 1, info.rowCount - 1);
  const bytes = await workbook.xlsx.writeBuffer();
  // Copy to a plain ArrayBuffer, compatible with browser Blob and independent readers.
  return new Uint8Array(bytes).buffer;
}

export async function exportExcel(
  session: Session,
  attendance: Map<string, AttendancePrivate>,
  audit: AuditEntry[] = [],
): Promise<void> {
  downloadFile(
    new Blob([await buildExcelReport(session, attendance, audit)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    reportFilename(session, 'xlsx'),
  );
}
