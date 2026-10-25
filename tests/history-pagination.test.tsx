// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AuditTrail } from '../src/components/teacher/AuditTrail';
import { TeacherWorkspace } from '../src/components/teacher/TeacherWorkspace';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { createSession, saveRoster } from '../src/domain/attendance';
import { readReportSnapshot } from '../src/domain/reports';
import type { AuditEntry, Session } from '../src/types';

vi.mock('../src/components/teacher/ScannerView', () => ({ ScannerView: () => null }));
const session: Session = {
  id: 'synthetic-session',
  course: 'Synthetic course',
  section: 'A',
  roomPin: '492',
  startsAt: 0,
  graceMinutes: 15,
  roster: [],
  state: 'CLOSED',
};
const events: AuditEntry[] = Array.from({ length: 151 }, (_, index) => ({
  eventId: `event-${index}`,
  sessionId: session.id,
  action: index % 2 ? 'SCAN_LOGGED' : 'MANUAL_ENTRY',
  at: index * 1000,
  performedBy: 'TEACHER_PIN',
  reason: `Unique audit reason ${String(index).padStart(3, '0')}`,
}));
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('complete history with bounded rendering', () => {
  it('exposes audit events older than 100 and resets paging for search and changed sessions', () => {
    const view = render(<AuditTrail events={events} session={session} />);
    fireEvent.click(screen.getByText('Audit trail (151 events)'));
    const navigation = screen.getByRole('navigation', { name: 'Audit history pages' });
    expect(screen.getByText('Unique audit reason 150')).toBeTruthy();
    expect(screen.queryByText('Unique audit reason 000')).toBeNull();
    fireEvent.click(within(navigation).getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Unique audit reason 000')).toBeTruthy();
    expect(screen.queryByText('Unique audit reason 150')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search audit history'), {
      target: { value: 'reason 150' },
    });
    expect(screen.getByText('Unique audit reason 150')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search audit history'), { target: { value: '' } });
    fireEvent.click(within(navigation).getByRole('button', { name: 'Next page' }));
    view.rerender(
      <AuditTrail events={events.slice(100)} session={{ ...session, id: 'other-session' }} />,
    );
    expect(screen.getByText('Unique audit reason 150')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(52);
  });

  it('paginates attendance without narrowing the stored/exported roster and resets after filtering', async () => {
    const keys = await unlockVault('123456789012');
    await saveRoster(
      keys,
      Array.from({ length: 51 }, (_, i) => ({
        id: String(i).padStart(3, '0'),
        name: `Synthetic student ${String(i).padStart(3, '0')}`,
        section: 'A',
      })),
    );
    const active = await createSession(keys, {
      course: 'Synthetic course',
      section: 'A',
      startsAt: Date.now(),
      graceMinutes: 15,
      roomPin: '492',
    });
    const first = active.roster[0];
    const last = active.roster[50];
    render(<TeacherWorkspace keys={keys} onActive={() => {}} />);
    const navigation = await screen.findByRole('navigation', { name: 'Attendance roster pages' });
    expect(screen.getByRole('row', { name: new RegExp(first.name) })).toBeTruthy();
    expect(screen.queryByRole('row', { name: new RegExp(last.name) })).toBeNull();
    fireEvent.click(within(navigation).getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('row', { name: new RegExp(last.name) })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search roster'), { target: { value: first.id } });
    expect(screen.getByRole('row', { name: new RegExp(first.name) })).toBeTruthy();
    expect((await readReportSnapshot(keys, active.id)).session.roster).toHaveLength(51);
  });
});
