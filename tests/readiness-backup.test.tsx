// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BackupControls } from '../src/components/teacher/BackupControls';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { exportBackup } from '../src/db/backup';
import { downloadFile } from '../src/utils/download';
import { getBackupActivity } from '../src/domain/readiness';

vi.mock('../src/utils/download', () => ({ downloadFile: vi.fn() }));
const pin = '104928573612';
async function clearDatabase() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.mocked(downloadFile).mockReset();
  await clearDatabase();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('observed backup activity', () => {
  it('records only a download request after the real encrypted exporter succeeds', async () => {
    const keys = await unlockVault(pin);
    render(<BackupControls keys={keys} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download encrypted backup' }));
    await screen.findByText(/Encrypted backup download requested/);
    expect(getBackupActivity(keys.salt).downloadRequestedAt).toEqual(expect.any(Number));
    expect(getBackupActivity(keys.salt).restoreCompletedAt).toBeUndefined();
    expect(downloadFile).toHaveBeenCalledOnce();
  });

  it('does not record a failed download as observed backup activity', async () => {
    const keys = await unlockVault(pin);
    vi.mocked(downloadFile).mockImplementation(() => {
      throw new Error('Download unavailable');
    });
    render(<BackupControls keys={keys} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download encrypted backup' }));
    await screen.findByText('Download unavailable');
    expect(getBackupActivity(keys.salt)).toEqual({});
  });

  it('records a completed real restore against the restored vault and explains template replacement', async () => {
    const keys = await unlockVault(pin);
    await exportBackup(keys);
    const blob = vi.mocked(downloadFile).mock.calls[0][0];
    const file = new NodeFile([blob as unknown as NodeBlob], 'backup.json', {
      type: 'application/json',
    });
    await clearDatabase();
    render(<BackupControls />);
    fireEvent.change(screen.getByLabelText('Encrypted JSON backup'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Backup Master PIN'), { target: { value: pin } });
    const confirm = screen.getByLabelText('Replace all attendance data currently in this browser');
    expect(confirm.getAttribute('aria-describedby')).toContain('-templates');
    expect(screen.getByText(/Legacy backups contain no templates/)).toBeDefined();
    fireEvent.click(confirm);
    fireEvent.submit(screen.getByRole('button', { name: 'Restore backup' }).closest('form')!);
    await screen.findByText(/Restored 0 courses, 0 roster entries, and 0 attendance sessions/);
    expect((await db.meta.get('vault'))?.salt).toBe(keys.salt);
    expect(getBackupActivity(keys.salt)).toEqual({ restoreCompletedAt: expect.any(Number) });
  });

  it('associates restore errors with the fields and does not record rejected restoration', async () => {
    const keys = await unlockVault(pin);
    await exportBackup(keys);
    const blob = vi.mocked(downloadFile).mock.calls[0][0];
    const file = new NodeFile([blob as unknown as NodeBlob], 'backup.json', {
      type: 'application/json',
    });
    render(<BackupControls />);
    fireEvent.change(screen.getByLabelText('Encrypted JSON backup'), { target: { files: [file] } });
    const password = screen.getByLabelText('Backup Master PIN');
    fireEvent.change(password, { target: { value: '666666' } });
    fireEvent.click(screen.getByLabelText('Replace all attendance data currently in this browser'));
    fireEvent.submit(screen.getByRole('button', { name: 'Restore backup' }).closest('form')!);
    await screen.findByRole('status');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-describedby')).toContain(screen.getByRole('status').id);
    expect(getBackupActivity(keys.salt)).toEqual({});
  });
});
