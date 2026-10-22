// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { createSession, getAttendance, listSessions, saveRoster } from '../src/domain/attendance';
import { TeacherWorkspace } from '../src/components/teacher/TeacherWorkspace';
import type { VaultKeys } from '../src/types';

vi.mock('../src/components/teacher/ScannerView', () => ({
  ScannerView: ({ paused }: { paused: boolean }) => (
    <div>
      {paused ? 'Camera paused for manual entry' : 'Camera adapter mocked for interface testing'}
    </div>
  ),
}));
let keys: VaultKeys;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
  await saveRoster(keys, [{ id: '001', displayId: '00-1', name: 'Test Student', section: 'A' }]);
  await createSession(keys, {
    course: 'IT301',
    section: 'A',
    roomPin: '492',
    startsAt: Date.now(),
    graceMinutes: 15,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('teacher interface workflow', () => {
  it('opens F2 manual dialog, saves excusal, closes read-only, and reopens with a reason', async () => {
    render(<TeacherWorkspace keys={keys} onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Manual check-in / correction (F2)' });
    fireEvent.change(screen.getByLabelText('Search roster'), { target: { value: '00-1' } });
    expect(screen.getByRole('row', { name: /00-1 Test Student/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'F2' });
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByText('Camera paused for manual entry')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Search students'), {
      target: { value: '00-1' },
    });
    expect(within(dialog).getByRole('option', { name: 'Test Student · 00-1' })).toBeTruthy();
    const token = (await listSessions(keys))[0].roster[0].token;
    fireEvent.change(within(dialog).getByLabelText('Enrolled student'), {
      target: { value: token },
    });
    fireEvent.change(within(dialog).getByLabelText('Status', { exact: true }), {
      target: { value: 'EXCUSED' },
    });
    fireEvent.change(within(dialog).getByLabelText('Required reason'), {
      target: { value: 'Official school activity' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save attendance' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Camera adapter mocked for interface testing')).toBeTruthy();
    const session = (await listSessions(keys))[0];
    expect((await getAttendance(keys, session.id)).get(token)?.status).toBe('EXCUSED');
    fireEvent.click(screen.getByLabelText('Mark unrecorded students absent and close the session'));
    fireEvent.click(screen.getByRole('button', { name: 'Close attendance session' }));
    await screen.findByRole('heading', { name: 'Reopen for attendance changes' });
    expect(screen.queryByRole('button', { name: 'Manual check-in / correction (F2)' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Reason to reopen'), {
      target: { value: 'Late arrival review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen session' }));
    await screen.findByRole('button', { name: 'Manual check-in / correction (F2)' });
    expect((await listSessions(keys))[0].state).toBe('ACTIVE');
  });
});
