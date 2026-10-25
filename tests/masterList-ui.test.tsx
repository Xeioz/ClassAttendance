// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { MasterListImport } from '../src/components/teacher/MasterListImport';
import { TeacherWorkspace } from '../src/components/teacher/TeacherWorkspace';
import { classStudents, listClasses } from '../src/domain/classes';
import { readMasterFile } from '../src/utils/masterList';
import type { VaultKeys } from '../src/types';
vi.mock('../src/utils/masterList', async (original) => ({
  ...(await original<typeof import('../src/utils/masterList')>()),
  readMasterFile: vi.fn(),
}));
configure({ asyncUtilTimeout: 5000 });
let keys: VaultKeys;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  history.replaceState(null, '', '/#/teacher');
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
  vi.mocked(readMasterFile).mockResolvedValue([
    {
      name: 'CSV',
      headers: ['id', 'name', 'section'],
      rows: [
        ['CA202304427', 'Peña, José', 'A'],
        ['CA202304428', '', 'A'],
      ],
    },
  ]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openReview() {
  fireEvent.change(screen.getByLabelText('Choose or drop your master list'), {
    target: { files: [new File(['fixture'], 'master.csv')] },
  });
  await screen.findByRole('heading', { name: 'Match your columns' });
  fireEvent.click(screen.getByRole('button', { name: 'Review detected classes' }));
  await screen.findByRole('heading', { name: 'Complete the missing details' });
}
describe('import-first teacher workflow', () => {
  it('opens master-list import as the first task in an empty workspace', async () => {
    render(<TeacherWorkspace keys={keys} onActive={() => {}} />);
    await screen.findByRole('heading', { name: 'Import students and set up classes' });
    expect(screen.getByRole('button', { name: 'Import master list' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add class manually' })).toBeTruthy();
    expect(screen.queryByLabelText('Course code')).toBeNull();
  });
  it('keeps blanks editable, fills only missing class fields, and saves after all corrections', async () => {
    const saved = vi.fn(async () => {});
    render(<MasterListImport keys={keys} disabled={false} onSaved={saved} />);
    await openReview();
    expect((screen.getByLabelText('Course code *') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Term *') as HTMLInputElement).value).toBe('');
    const save = screen.getByRole('button', {
      name: 'Confirm and save master list',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(await db.students.count()).toBe(0);
    fireEvent.click(screen.getByText('Fill shared blanks across all classes'));
    fireEvent.change(screen.getByLabelText('Shared Course code'), { target: { value: 'IT301' } });
    fireEvent.change(screen.getByLabelText('Shared Section'), {
      target: { value: 'DO-NOT-OVERWRITE-A' },
    });
    fireEvent.change(screen.getByLabelText('Shared Term'), { target: { value: '2026 / 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply only to blank fields' }));
    expect((screen.getByLabelText('Section *') as HTMLInputElement).value).toBe('A');
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Student name · file row 3'), {
      target: { value: 'Niño, Érica' },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByRole('heading', { name: 'Your classes are ready' });
    expect(saved).toHaveBeenCalledOnce();
    const classes = await listClasses(keys);
    expect(classes).toHaveLength(1);
    expect(
      (await classStudents(keys, classes[0].id)).map((student) => student.name).sort(),
    ).toEqual(['Niño, Érica', 'Peña, José']);
  });
  it('retains the edited preview after save failure and lets the teacher retry', async () => {
    vi.mocked(readMasterFile).mockResolvedValue([
      {
        name: 'CSV',
        headers: ['id', 'name', 'section', 'course', 'term'],
        rows: [['CA1', 'Ana', 'A', 'IT301', '2026']],
      },
    ]);
    render(<MasterListImport keys={keys} disabled={false} onSaved={async () => {}} />);
    await openReview();
    fireEvent.change(screen.getByLabelText('Subject (optional)'), {
      target: { value: 'Web Systems' },
    });
    const failure = vi
      .spyOn(db.enrollments, 'bulkAdd')
      .mockRejectedValueOnce(new Error('Quota exceeded'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and save master list' }));
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Confirm and save master list' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect((screen.getByLabelText('Subject (optional)') as HTMLInputElement).value).toBe(
      'Web Systems',
    );
    expect(await db.classes.count()).toBe(0);
    failure.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and save master list' }));
    await screen.findByRole('heading', { name: 'Your classes are ready' });
  });
});
