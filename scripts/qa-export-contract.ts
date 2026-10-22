import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { AttendancePrivate, AuditEntry, AttendanceStatus, Session } from '../src/types';

export const attendanceHeaders = [
  'Student ID (display)',
  'Official name',
  'Section',
  'Status',
  'First recorded (UTC)',
  'Last changed (UTC)',
  'Source',
  'Reason',
  'Student ID (canonical)',
];
export const auditHeaders = [
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
];
export const csvHeaders = [
  'Student ID',
  'Official name',
  'Section',
  'Status',
  'First recorded (UTC)',
  'Last changed (UTC)',
  'Source',
  'Reason',
  'Institution',
  'Course',
  'Subject',
  'Room',
  'Class date',
  'Timezone',
  'Session ID',
  'Session state',
];
const names = [
  '=1+1',
  'Peña, José',
  '学生 Δοκιμή',
  'Name\nSecond line',
  'Long name '.repeat(20),
  '+SUM(A1)',
  '@SUM(A1)',
];
const statuses: (AttendanceStatus | undefined)[] = [
  'PRESENT',
  'LATE',
  'ABSENT',
  'EXCUSED',
  undefined,
];
const start = Date.parse('2026-10-22T08:15:00.000Z');

export function exportFixture(count: number) {
  const session: Session = {
    id: `synthetic-${count}`,
    course: 'QA101',
    section: 'A',
    roomPin: '492',
    startsAt: start,
    graceMinutes: 15,
    timezone: 'UTC',
    institution: 'Synthetic QA institution',
    subject: 'Export validation',
    room: 'Test room',
    state: 'ACTIVE',
    roster: [],
  };
  const attendance = new Map<string, AttendancePrivate>();
  const audit: AuditEntry[] = [];
  const attendanceRows: string[][] = [],
    auditRows: string[][] = [],
    csvRows: string[][] = [];
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, PENDING: 0 };
  for (let i = 0; i < count; i++) {
    const id = i === 1 ? `00${'1234567890'.repeat(6)}1` : String(i + 1).padStart(8, '0');
    const displayId = `${id.slice(0, 2)}-${id.slice(2)}`;
    const student = {
      id,
      displayId,
      name: names[i % names.length],
      section: 'A',
      token: `token-${i}`,
    };
    const status = statuses[i % statuses.length];
    const reason =
      i % 3 === 0
        ? ('Long reason, "quoted"\n' + 'detail '.repeat(68)).slice(0, 500)
        : 'Synthetic reason';
    session.roster.push(student);
    counts[status ?? 'PENDING']++;
    if (status)
      attendance.set(student.token, {
        status,
        source: 'MANUAL',
        at: start + 1000,
        originalAt: start,
        reason,
      });
    const event: AuditEntry = {
      eventId: `event-${i}`,
      sessionId: session.id,
      studentToken: student.token,
      studentId: id,
      action: status ? 'MANUAL_ENTRY' : 'LEGACY_SCAN_ATTEMPT',
      at: start + 1000,
      performedBy: 'TEACHER_PIN',
      newStatus: status,
      firstAt: i === 0 ? 0 : start,
      secondAt: i === 0 ? 0 : start + 1000,
      reason,
    };
    audit.push(event);
    const row = [
      displayId,
      student.name,
      'A',
      status ?? 'NOT_YET_RECORDED',
      status && status !== 'ABSENT' ? '2026-10-22T08:15:00.000Z' : '',
      status ? '2026-10-22T08:15:01.000Z' : '',
      status ? 'MANUAL' : '',
      status ? reason : '',
      id,
    ];
    attendanceRows.push(row);
    auditRows.push([
      event.eventId,
      event.action,
      '2026-10-22T08:15:01.000Z',
      id,
      '',
      status ?? '',
      i === 0 ? '1970-01-01T00:00:00.000Z' : '2026-10-22T08:15:00.000Z',
      i === 0 ? '1970-01-01T00:00:00.000Z' : '2026-10-22T08:15:01.000Z',
      '',
      'TEACHER_PIN',
      reason,
      displayId,
    ]);
    const csvRow = [
      ...row.slice(0, 8),
      'Synthetic QA institution',
      'QA101',
      'Export validation',
      'Test room',
      '2026-10-22',
      'UTC',
      session.id,
      'ACTIVE',
    ];
    csvRows.push(
      csvRow.map((value) => (/^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value)),
    );
  }
  return {
    session,
    attendance,
    audit,
    expected: {
      attendanceHeaders,
      auditHeaders,
      csvHeaders,
      attendanceRows,
      auditRows,
      csvRows,
      counts,
      rate: count ? (counts.PRESENT + counts.LATE) / count : 0,
      sessionId: session.id,
    },
  };
}

export async function verifyExport(
  bytes: ArrayBuffer,
  csv: string,
  fixture: ReturnType<typeof exportFixture>,
) {
  const { expected, session } = fixture;
  const readback = XLSX.read(bytes, { type: 'array', cellNF: true });
  assert.deepEqual(readback.SheetNames, ['Summary', 'Attendance', 'Audit trail', 'Report info']);
  const rows = (sheet: string) =>
    XLSX.utils.sheet_to_json<string[]>(readback.Sheets[sheet], {
      header: 1,
      defval: '',
      blankrows: false,
    });
  assert.deepEqual(rows('Attendance'), [attendanceHeaders, ...expected.attendanceRows]);
  assert.deepEqual(rows('Audit trail'), [auditHeaders, ...expected.auditRows]);
  assert.equal(readback.Sheets.Summary.B10.v, session.roster.length);
  assert.equal(readback.Sheets.Summary.B16.v, expected.rate);
  assert.equal(readback.Sheets.Summary.B16.t, 'n');
  for (const [index, key] of ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'PENDING'].entries()) {
    const count = expected.counts[key as keyof typeof expected.counts];
    assert.equal(readback.Sheets.Summary[`B${11 + index}`].v, count);
    assert.equal(
      readback.Sheets.Summary[`C${11 + index}`].v,
      session.roster.length ? count / session.roster.length : 0,
    );
  }
  for (const [name, width, count] of [
    ['Attendance', 9, session.roster.length],
    ['Audit trail', 12, fixture.audit.length],
  ] as const) {
    for (let r = 2; r <= count + 1; r++)
      for (let c = 0; c < width; c++) {
        const cell = readback.Sheets[name][XLSX.utils.encode_cell({ r: r - 1, c })];
        if (cell) {
          assert.equal(cell.t, 's');
          assert.equal(cell.f, undefined);
        }
      }
  }
  assert(csv.startsWith('\uFEFF'));
  const parsed = Papa.parse<string[]>(csv.slice(1), { skipEmptyLines: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.data, [csvHeaders, ...expected.csvRows]);
  const styled = new ExcelJS.Workbook();
  await styled.xlsx.load(bytes);
  const attendance = styled.getWorksheet('Attendance')!;
  const audit = styled.getWorksheet('Audit trail')!;
  for (const sheet of [attendance, audit]) {
    assert.equal(sheet.views[0].state, 'frozen');
    assert.equal((sheet.views[0] as ExcelJS.WorksheetViewFrozen).ySplit, 1);
    assert.equal(sheet.getCell('A1').font.bold, true);
    assert.equal(sheet.getCell('A1').alignment.wrapText, true);
    assert((sheet.getRow(1).height ?? 0) >= 32);
  }
  assert.equal((attendance.views[0] as ExcelJS.WorksheetViewFrozen).xSplit, 2);
  assert.equal(attendance.autoFilter, `A1:I${session.roster.length + 1}`);
  assert.equal(audit.autoFilter, `A1:L${fixture.audit.length + 1}`);
  assert.equal(styled.getWorksheet('Summary')!.getCell('B16').numFmt, '0.0%');
  for (let r = 2; r <= session.roster.length + 1; r++) {
    for (const col of ['B', 'H'])
      assert.equal(attendance.getCell(`${col}${r}`).alignment.wrapText, true);
    assert.equal(attendance.getCell(`A${r}`).numFmt, '@');
    assert.equal(audit.getCell(`K${r}`).alignment.wrapText, true);
    if (expected.attendanceRows[r - 2][7].length > 100)
      assert((attendance.getRow(r).height ?? 0) > 22);
  }
  return {
    records: session.roster.length,
    auditEvents: fixture.audit.length,
    exactAttendanceValues: true,
    exactAuditValues: true,
    exactCSVValues: true,
    identifierTypes: 'text',
    formulasIntroduced: false,
    freezeRows: 1,
    attendanceFrozenColumns: 2,
    wrappedNamesAndReasons: true,
    explicitRowHeights: true,
    filters: true,
    percentageFormats: true,
    readers: ['SheetJS', 'ExcelJS'],
    desktopVisualVerification: 'Not tested',
  };
}
