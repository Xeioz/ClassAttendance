// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeacherPortal } from '../src/components/teacher/TeacherPortal';
import { db } from '../src/db/db';
import * as database from '../src/db/db';
import * as vault from '../src/db/vault';
import { deriveKeys, randomSalt } from '../src/db/crypto';
import type { VaultKeys } from '../src/types';

vi.mock('../src/components/teacher/TeacherWorkspace', () => ({
  TeacherWorkspace: () => <p>Unlocked test workspace</p>,
}));
vi.mock('../src/components/teacher/BackupControls', () => ({ BackupControls: () => null }));
let keys: VaultKeys;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await db.meta.clear();
  keys = await deriveKeys('123456789012', randomSalt());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function submit() {
  await screen.findByLabelText('Confirm new PIN');
  fireEvent.change(screen.getByLabelText('Master PIN (6–12 digits)'), {
    target: { value: '123456789012' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '123456789012' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create encrypted workspace' }));
}
describe('pending vault unlock and advisory storage', () => {
  it('does not resurrect unlocked views when key derivation finishes after pagehide', async () => {
    let resolve!: (keys: VaultKeys) => void;
    const unlock = vi.spyOn(vault, 'unlockVault').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<TeacherPortal onActive={() => {}} />);
    await submit();
    await waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    fireEvent(window, new Event('pagehide'));
    await act(async () => resolve(keys));
    expect(screen.queryByText('Unlocked test workspace')).toBeNull();
    expect((screen.getByLabelText('Master PIN (6–12 digits)') as HTMLInputElement).value).toBe('');
    expect(
      (screen.getByRole('button', { name: 'Create encrypted workspace' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('unlocks independently of storage permission and ignores a late response after lock', async () => {
    vi.spyOn(vault, 'unlockVault').mockResolvedValue(keys);
    let resolve!: (message: string) => void;
    vi.spyOn(database, 'requestPersistence').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<TeacherPortal onActive={() => {}} />);
    await submit();
    await screen.findByText('Unlocked test workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Lock teacher records' }));
    await act(async () => resolve('Late persistence result'));
    expect(screen.queryByText('Unlocked test workspace')).toBeNull();
    expect(screen.queryByText('Late persistence result')).toBeNull();
  });

  it('retains successful unlock when optional persistence rejects', async () => {
    vi.spyOn(vault, 'unlockVault').mockResolvedValue(keys);
    vi.spyOn(database, 'requestPersistence').mockRejectedValue(new Error('Storage unavailable'));
    render(<TeacherPortal onActive={() => {}} />);
    await submit();
    await screen.findByText('Unlocked test workspace');
    await screen.findByText('Storage persistence could not be checked. Keep encrypted backups.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
