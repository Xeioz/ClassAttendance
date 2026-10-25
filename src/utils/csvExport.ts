import Papa from 'papaparse';
import type { AttendancePrivate, Session } from '../types';
import { recordedTime, reportFilename, sessionDate } from '../domain/reports';
import { downloadFile } from './download';

export function spreadsheetSafe(value: string): string {
  return /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
}
export function attendanceCSV(
  session: Session,
  attendance: Map<string, AttendancePrivate>,
): string {
  const rows = session.roster
    .map((student) => {
      const entry = attendance.get(student.token);
      return {
        'Student ID': student.displayId ?? student.id,
        'Official name': student.name,
        Section: student.section,
        Status: entry?.status ?? 'NOT_YET_RECORDED',
        'Recorded / corrected (UTC)': recordedTime(entry),
        'Last changed (UTC)': entry ? new Date(entry.at).toISOString() : '',
        Source: entry?.source ?? '',
        Reason: entry?.reason ?? '',
        Institution: session.institution ?? '',
        Course: session.course,
        Subject: session.subject ?? '',
        Room: session.room ?? '',
        'Class date': sessionDate(session),
        Timezone: session.timezone ?? 'Asia/Manila',
        'Session ID': session.id,
        'Session state': session.state,
      };
    })
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, spreadsheetSafe(value)])),
    );
  return '\uFEFF' + Papa.unparse(rows, { newline: '\r\n' });
}
export function exportCSV(session: Session, attendance: Map<string, AttendancePrivate>): void {
  downloadFile(
    new Blob([attendanceCSV(session, attendance)], { type: 'text/csv;charset=utf-8' }),
    reportFilename(session, 'csv'),
  );
}
