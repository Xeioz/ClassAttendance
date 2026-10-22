// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { exportBackup } from '../src/db/backup';
import { downloadFile } from '../src/utils/download';
import { TeacherPortal } from '../src/components/teacher/TeacherPortal';
import { AuditTrail } from '../src/components/teacher/AuditTrail';
import { createSession, recordAttendance, saveRoster } from '../src/domain/attendance';
import { readReportSnapshot } from '../src/domain/reports';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));

const pin = '104928573612';
const now = 1_800_000_000_000;
async function clearDatabase() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
async function databaseSnapshot() {
  return Promise.all(db.tables.map(async (table) => [table.name, await table.toArray()]));
}
async function fixture() {
  const keys = await unlockVault(pin);
  await saveRoster(keys, [
    { id: '001', displayId: '00-1', name: 'Peña, José', section: 'A' },
    { id: '002', displayId: '00-2', name: 'Synthetic Bob', section: 'A' },
  ]);
  const session = await createSession(keys, {
    course: 'QA101',
    section: 'A',
    roomPin: '492',
    startsAt: now,
    graceMinutes: 15,
  });
  await recordAttendance(
    keys,
    session.id,
    { student: session.roster.find((student) => student.id === '001')!, reason: 'Approved visit' },
    now,
  );
  await recordAttendance(
    keys,
    session.id,
    { raw: JSON.stringify({ v: 1, id: '002', ch: '492', ts: now / 1000 }) },
    now,
  );
  return { keys, session };
}
async function backupFile() {
  const { keys } = await fixture();
  await exportBackup(keys);
  const blob = vi.mocked(downloadFile).mock.calls.at(-1)![0];
  return new NodeFile([blob as unknown as NodeBlob], 'synthetic-backup.json', {
    type: 'application/json',
  });
}
function submitRestore(file: NodeFile, password = pin) {
  fireEvent.change(screen.getByLabelText('Encrypted JSON backup'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('Backup Master PIN'), { target: { value: password } });
  fireEvent.click(screen.getByLabelText('Replace all attendance data currently in this browser'));
  // jsdom does not populate native file-input validity from a synthetic files list.
  fireEvent.submit(screen.getByRole('button', { name: 'Restore backup' }).closest('form')!);
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  await clearDatabase();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('restore interface regression', () => {
  it('refreshes a fresh portal immediately and unlocks restored records without navigation', async () => {
    const file = await backupFile();
    await clearDatabase();
    render(<TeacherPortal onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Create encrypted workspace' });
    fireEvent.change(screen.getByLabelText('Master PIN (6–12 digits)'), {
      target: { value: '777777' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '777777' } });
    submitRestore(file);
    await screen.findByText(/Restored 1 courses, 2 roster entries, and 1 attendance sessions/);
    expect(await db.meta.get('vault')).toBeDefined();
    expect(screen.queryByLabelText('Confirm new PIN')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create encrypted workspace' })).toBeNull();
    expect((screen.getByLabelText('Master PIN (6–12 digits)') as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(screen.getByLabelText('Master PIN (6–12 digits)'));
    fireEvent.change(screen.getByLabelText('Master PIN (6–12 digits)'), { target: { value: pin } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock teacher workspace' }));
    await screen.findByRole('button', { name: 'Lock teacher records' });
    expect(await db.attendance.count()).toBe(2);
  });

  it('keeps creation mode and the empty database after invalid restoration', async () => {
    render(<TeacherPortal onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Create encrypted workspace' });
    const before = await databaseSnapshot();
    submitRestore(new NodeFile(['{}'], 'invalid.json'));
    await screen.findByText('Unsupported backup format.');
    expect(screen.getByRole('button', { name: 'Create encrypted workspace' })).toBeTruthy();
    expect(screen.getByLabelText('Confirm new PIN')).toBeTruthy();
    expect(screen.queryByText(/Restored \d+ courses/)).toBeNull();
    expect(await databaseSnapshot()).toEqual(before);
  });

  it('preserves existing unlock mode and data after a wrong-PIN restore', async () => {
    const file = await backupFile();
    const before = await databaseSnapshot();
    render(<TeacherPortal onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Unlock teacher workspace' });
    submitRestore(file, '999999');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/decrypt|PIN/i));
    expect(screen.queryByText(/Restored \d+ courses/)).toBeNull();
    expect(screen.queryByLabelText('Confirm new PIN')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock teacher workspace' })).toBeTruthy();
    expect(await databaseSnapshot()).toEqual(before);
  });

  it('clears an earlier success when another restore fails', async () => {
    const file = await backupFile();
    await clearDatabase();
    render(<TeacherPortal onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Create encrypted workspace' });
    submitRestore(file);
    await screen.findByText(/Restored 1 courses, 2 roster entries, and 1 attendance sessions/);
    const before = await databaseSnapshot();
    submitRestore(file, '999999');
    expect(screen.queryByText(/Restored \d+ courses/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/decrypt|PIN/i));
    expect(await databaseSnapshot()).toEqual(before);
    expect(screen.getByRole('button', { name: 'Unlock teacher workspace' })).toBeTruthy();
  });
});

describe('audit search regression', () => {
  it('finds display/canonical IDs, names and reasons without bypassing the action filter', async () => {
    const { keys, session } = await fixture();
    const snapshot = await readReportSnapshot(keys, session.id);
    render(<AuditTrail session={snapshot.session} events={snapshot.audit} />);
    const search = screen.getByLabelText('Search audit history');
    const expectMatches = (query: string, count: number) => {
      fireEvent.change(search, { target: { value: query } });
      expect(
        screen.getByText(new RegExp(`Showing ${count} of ${count} matching events`)),
      ).toBeTruthy();
    };
    for (const query of ['00-1', '001', '  00-1  ', '0 0 1', 'JOSÉ', 'Approved visit'])
      expectMatches(query, 1);
    expectMatches('999', 0);
    expectMatches('---', 0);
    expectMatches('!!!', 0);
    expectMatches('', 2);
    expectMatches('   ', 2);
    const manualAction = snapshot.audit.find((event) => event.reason === 'Approved visit')!.action;
    const qrAction = snapshot.audit.find((event) => event.studentId === '002')!.action;
    expect(manualAction).not.toBe(qrAction);
    fireEvent.change(screen.getByLabelText('Action', { exact: true }), {
      target: { value: qrAction },
    });
    expectMatches('00-1', 0);
    expectMatches('00-2', 1);
    fireEvent.change(screen.getByLabelText('Action', { exact: true }), { target: { value: '' } });
    expectMatches('00-1', 1);
  });
});
