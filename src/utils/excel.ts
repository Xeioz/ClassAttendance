import type { AttendancePrivate, AuditEntry, Session } from '../types';
import { attendanceSummary, recordedTime, reportFilename, sessionDate } from '../domain/reports';
import { downloadFile } from './download';

export async function exportExcel(
  session: Session,
  attendance: Map<string, AttendancePrivate>,
  audit: AuditEntry[] = [],
): Promise<void> {
  const XLSX = await import('xlsx');
  const { total, counts, rate } = attendanceSummary(session, attendance);
  const tableHeader = [
    'Student ID',
    'Official name',
    'Section',
    'Status',
    'First recorded (UTC)',
    'Last changed (UTC)',
    'Source',
    'Reason',
  ];
  const header = [
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
    ['Closed (UTC)', session.closedAt ? new Date(session.closedAt).toISOString() : ''],
    [],
    ['ATTENDANCE SUMMARY', 'Count', 'Share of enrolled'],
    ['Enrolled', total, total ? 1 : 0],
    ...(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'PENDING'] as const).map((status) => [
      status === 'PENDING' ? 'Not yet recorded' : status,
      counts[status],
      total ? counts[status] / total : 0,
    ]),
    ['Attendance rate (present + late / enrolled)', rate],
    [],
    tableHeader,
  ];
  const rows = session.roster.map((student) => {
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
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  sheet['!cols'] = [22, 34, 20, 24, 28, 28, 14, 50].map((wch) => ({ wch }));
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
  sheet['!autofilter'] = { ref: `A${header.length}:H${header.length + rows.length}` };
  for (let row = 10; row <= 15; row++) if (sheet[`C${row}`]) sheet[`C${row}`].z = '0.0%';
  if (sheet.B16) sheet.B16.z = '0.0%';
  const auditSheet = XLSX.utils.aoa_to_sheet([
    [
      'Event ID',
      'Action',
      'Event time (UTC)',
      'Student ID',
      'Previous status',
      'New status',
      'First presentation (UTC)',
      'Second presentation (UTC)',
      'Dispute ID',
      'Local actor',
      'Reason',
    ],
    ...audit.map((event) => [
      event.eventId,
      event.action,
      new Date(event.at).toISOString(),
      event.studentId ??
        session.roster.find((student) => student.token === event.studentToken)?.id ??
        '',
      event.previousStatus ?? '',
      event.newStatus ?? '',
      event.firstAt ? new Date(event.firstAt).toISOString() : '',
      event.secondAt ? new Date(event.secondAt).toISOString() : '',
      event.disputeId ?? '',
      event.performedBy,
      event.reason ?? '',
    ]),
  ]);
  auditSheet['!cols'] = [38, 25, 28, 22, 18, 18, 28, 28, 38, 18, 55].map((wch) => ({ wch }));
  auditSheet['!autofilter'] = { ref: `A1:K${audit.length + 1}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit trail');
  const bytes = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  }) as ArrayBuffer;
  // User-controlled string cells never become formulas.
  downloadFile(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    reportFilename(session, 'xlsx'),
  );
}
