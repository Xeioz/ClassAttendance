// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { listStudents, saveRoster } from '../src/domain/attendance';
import { RosterUpload } from '../src/components/teacher/RosterUpload';
import type { VaultKeys } from '../src/types';

let keys: VaultKeys;
const startingRow = { id: '001', displayId: '00-1', name: 'Existing Name', section: 'A' };
function upload(rows: string) {
  fireEvent.change(screen.getByLabelText('Choose or drop a CSV'), {
    target: { files: [new NodeFile([`id,name,section\n${rows}`], 'roster.csv')] },
  });
}
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
  await saveRoster(keys, [startingRow]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('roster change review controls', () => {
  it('shows before/after values, blocks unapproved updates, and saves all rows despite filters', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const state = vi.fn();
    render(
      <RosterUpload keys={keys} onSaved={onSaved} disabled={false} onReviewStateChange={state} />,
    );
    upload('001,Proposed Name,A\n002,New Student,A');
    await screen.findByText('Existing: Existing Name');
    expect(screen.getByText('Proposed: Proposed Name')).toBeTruthy();
    expect(screen.getByText('Existing: 00-1')).toBeTruthy();
    expect(screen.getByText('Proposed: 001')).toBeTruthy();
    const save = screen.getByRole('button', {
      name: 'Save 1 additions and 1 updates',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(state).toHaveBeenLastCalledWith({ pending: true, blockingIssues: 1, changes: 2 });
    fireEvent.click(screen.getByRole('checkbox', { name: /Approve update for row 2, ID 001/ }));
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Filter change category'), {
      target: { value: 'updated' },
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(await listStudents(keys)).toHaveLength(2);
    expect((await listStudents(keys)).find((student) => student.id === '001')?.name).toBe(
      'Proposed Name',
    );
    expect(state).toHaveBeenLastCalledWith({ pending: false, blockingIssues: 0, changes: 0 });
  });

  it('keeps every invalid/conflicting row visible, blocks the entire file, and cancels without writes', async () => {
    const before = await db.students.toArray();
    render(<RosterUpload keys={keys} onSaved={async () => {}} disabled={false} />);
    upload('002,First,A\n00-2,Second,A\n,Missing ID,A\n003,Valid,A');
    await screen.findByText(/Total parsed rows: 4/);
    expect(screen.getByText(/Invalid rows: 1 · Identity conflicts: 2/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Save 1 additions and 0 updates' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Filter change category'), {
      target: { value: 'conflict' },
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByText(/Duplicate or normalization collision in rows 2, 3/)).toHaveLength(
      2,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel roster review' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Choose or drop a CSV'));
    expect(await db.students.toArray()).toEqual(before);
  });

  it('refreshes stale comparisons, resets approvals, and requires a second explicit save', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<RosterUpload keys={keys} onSaved={onSaved} disabled={false} />);
    upload('001,Teacher Proposed,A');
    await screen.findByText('Existing: Existing Name');
    fireEvent.click(screen.getByRole('checkbox', { name: /Approve update for row 2/ }));
    await saveRoster(keys, [{ ...startingRow, name: 'Other Tab Name' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Save 0 additions and 1 updates' }));
    await screen.findByText(/The comparison is refreshed and earlier approvals are cleared/);
    expect(screen.getByText('Existing: Other Tab Name')).toBeTruthy();
    const checkbox = screen.getByRole('checkbox', {
      name: /Approve update for row 2/,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect((await listStudents(keys))[0].name).toBe('Other Tab Name');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save 0 additions and 1 updates' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect((await listStudents(keys))[0].name).toBe('Teacher Proposed');
  });

  it('preserves the review after a storage failure so the teacher can retry or cancel', async () => {
    const before = await db.students.toArray();
    const onSaved = vi.fn();
    render(<RosterUpload keys={keys} onSaved={onSaved} disabled={false} />);
    upload('002,Incoming,A');
    await screen.findByText('Incoming');
    vi.spyOn(db.students, 'bulkPut').mockRejectedValueOnce(new Error('Synthetic full storage'));
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 additions and 0 updates' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Synthetic full storage')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.students.toArray()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel roster review' }));
    expect(await db.students.toArray()).toEqual(before);
  });
});
