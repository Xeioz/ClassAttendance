// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import * as backup from '../src/db/backup';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import { db } from '../src/db/db';
import { isTeacherBusy, teacherOperation } from '../src/domain/operations';
import { listClasses } from '../src/domain/classes';
import { unlockVault } from '../src/db/vault';
vi.mock('../src/components/common/OfflineStatus', () => ({
  OfflineStatus: () => <div>Offline adapter mocked</div>,
}));
vi.mock('../src/components/student/DynamicQR', () => ({
  DynamicQR: ({ id }: { id: string }) => <div>QR for {id}</div>,
}));
configure({ asyncUtilTimeout: 5000 });
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  history.replaceState(null, '', '/#/');
  localStorage.clear();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('role and teacher journeys', () => {
  it('shows role choices at root and opens a saved student destination directly', async () => {
    const view = render(<App />);
    expect(screen.getByRole('button', { name: /I am a Student/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /I am a Student/ }));
    await screen.findByLabelText('Student ID');
    expect(location.hash).toBe('#/student');
    view.unmount();
    render(<App />);
    expect(screen.getByLabelText('Student ID')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /I am a Teacher/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to content' }));
    expect(location.hash).toBe('#/student');
    expect(document.activeElement?.id).toBe('main');
    fireEvent.change(screen.getByLabelText('Student ID'), { target: { value: 'CA-202304427' } });
    fireEvent.change(screen.getByLabelText('Room challenge'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Display QR pass' }));
    expect(screen.getByText('QR for CA202304427')).toBeTruthy();
    expect(await db.meta.count()).toBe(0);
  });
  it('blocks role changes and hash navigation while a teacher operation is pending', async () => {
    history.replaceState(null, '', '/#/student');
    render(<App />);
    let finish!: () => void;
    const run = teacherOperation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const task = run();
    expect(isTeacherBusy()).toBe(true);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Change role' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    location.hash = '/teacher';
    await waitFor(() => expect(location.hash).toBe('#/student'));
    finish();
    await task;
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Change role' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
  it('refreshes first-use PIN state after restoration without creating a replacement vault', async () => {
    const restored = vi.spyOn(backup, 'restoreBackup').mockImplementation(async () => {
      await unlockVault('104928573612');
      return { courses: 0, students: 0, sessions: 0 };
    });
    history.replaceState(null, '', '/#/teacher');
    render(<App />);
    await screen.findByRole('heading', { name: 'Create your teacher PIN' });
    fireEvent.change(screen.getByLabelText('Encrypted JSON backup'), {
      target: { files: [new File(['fixture'], 'backup.json')] },
    });
    fireEvent.change(screen.getByLabelText('Backup Master PIN'), {
      target: { value: '104928573612' },
    });
    fireEvent.click(screen.getByLabelText('Replace all attendance data currently in this browser'));
    fireEvent.submit(screen.getByRole('button', { name: 'Restore backup' }).closest('form')!);
    await screen.findByRole('heading', { name: 'Unlock teacher portal' });
    expect(restored).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Confirm new PIN')).toBeNull();
    expect((screen.getByLabelText('Backup Master PIN') as HTMLInputElement).value).toBe('');
  });
  it('creates a PIN, creates a class, and locks records when changing roles', async () => {
    history.replaceState(null, '', '/#/teacher');
    render(<App />);
    await screen.findByRole('heading', { name: 'Create your teacher PIN' });
    fireEvent.change(screen.getByLabelText('Master PIN (6–12 digits)'), {
      target: { value: '104928573612' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), {
      target: { value: '104928573612' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create encrypted workspace' }));
    await screen.findByRole('button', { name: '+ Add class manually' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add class manually' }));
    await screen.findByRole('heading', { name: 'Add a class' });
    fireEvent.change(screen.getByLabelText('Course code'), { target: { value: 'IT301' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'BSIT-3A' } });
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: '2026 / 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create class and add students' }));
    await screen.findByRole('heading', { name: 'Class roster' });
    const classes = await listClasses(await unlockVault('104928573612'));
    expect(classes).toHaveLength(1);
    expect(location.hash).toContain(classes[0].id);
    fireEvent.click(screen.getByRole('button', { name: 'Change role' }));
    await screen.findByRole('button', { name: /I am a Teacher/ });
    fireEvent.click(screen.getByRole('button', { name: /I am a Teacher/ }));
    await screen.findByRole('heading', { name: 'Unlock teacher portal' });
    expect(screen.queryByRole('button', { name: '+ Add class manually' })).toBeNull();
    expect((screen.getByLabelText('Master PIN (6–12 digits)') as HTMLInputElement).value).toBe('');
  });
});
