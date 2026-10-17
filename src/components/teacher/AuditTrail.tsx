import { useState } from 'react';
import type { AuditEntry, Session } from '../../types';

export function AuditTrail({ events, session }: { events: AuditEntry[]; session: Session }) {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const filtered = [...events]
    .reverse()
    .filter(
      (event) =>
        (!action || event.action === action) &&
        `${event.studentId ?? ''} ${session.roster.find((student) => student.token === event.studentToken)?.name ?? ''} ${event.reason ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <details className="card">
      <summary className="min-h-12 cursor-pointer text-xl font-semibold">
        Audit trail ({events.length} events)
      </summary>
      <p className="mb-4 mt-3 text-sm text-slate-600">
        Application history is append-only through this interface. It is not independent proof
        against device-owner tampering. TEACHER_PIN identifies local unlock authority, not a
        verified school account.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Search audit history
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" />
        </label>
        <label>
          Action
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">All actions</option>
            {[...new Set(events.map((event) => event.action))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="my-3 text-xs">
        Showing {Math.min(100, filtered.length)} of {filtered.length} matching events. Excel
        includes the complete audit trail.
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Session audit events</caption>
          <thead>
            <tr>
              {['Time', 'Action', 'Student', 'Status change', 'Reason'].map((label) => (
                <th className="p-2" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((event) => (
              <tr className="border-t align-top" key={event.eventId}>
                <td className="whitespace-nowrap p-2">{new Date(event.at).toLocaleString()}</td>
                <td className="p-2">{event.action}</td>
                <td className="p-2">
                  {session.roster.find((student) => student.token === event.studentToken)?.name ??
                    event.studentId ??
                    'Session'}
                </td>
                <td className="p-2">
                  {event.previousStatus ?? '—'} / {event.newStatus ?? '—'}
                </td>
                <td className="min-w-48 p-2">{event.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
