import type { AttendancePrivate, Session } from '../types';
import { downloadFile } from './download';

export async function exportExcel(
  session: Session,
  attendance: Map<string, AttendancePrivate>,
): Promise<void> {
  const XLSX = await import('xlsx');
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, PENDING: 0 };
  const rows = session.roster.map((student) => {
    const entry = attendance.get(student.token);
    counts[entry?.status ?? 'PENDING']++;
    return [
      student.id,
      student.name,
      student.section,
      entry?.status ?? 'NOT_YET_RECORDED',
      entry ? new Date(entry.at).toISOString() : '',
      entry?.source ?? '',
      entry?.reason ?? '',
    ];
  });
  const attended = counts.PRESENT + counts.LATE;
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ATTENDANCE DESK · CLASS RECORD'],
    ['Course', session.course, 'Section', session.section],
    ['Session', session.id, 'State', session.state],
    [
      'Start (UTC)',
      new Date(session.startsAt).toISOString(),
      'Grace (minutes)',
      session.graceMinutes,
    ],
    ['Enrolled', session.roster.length, 'Present', counts.PRESENT, 'Late', counts.LATE],
    ['Absent', counts.ABSENT, 'Excused', counts.EXCUSED, 'Not yet recorded', counts.PENDING],
    [
      'Attendance rate (present + late / enrolled)',
      session.roster.length ? attended / session.roster.length : 0,
    ],
    [],
    ['Student ID', 'Official name', 'Section', 'Status', 'Recorded (UTC)', 'Source', 'Reason'],
    ...rows,
  ]);
  // SheetJS string cells stay strings, including formula-looking student names.
  sheet['!cols'] = [20, 32, 20, 24, 28, 14, 45].map((wch) => ({ wch }));
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  sheet['!autofilter'] = { ref: `A9:G${9 + rows.length}` };
  if (sheet.B7) sheet.B7.z = '0.0%';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  const bytes = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  }) as ArrayBuffer;
  const safe = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  downloadFile(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${safe(session.course)}_${safe(session.section)}_${new Date(session.startsAt).toISOString().slice(0, 10)}.xlsx`,
  );
}
