// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RosterUpload } from '../src/components/teacher/RosterUpload';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { listStudents } from '../src/domain/attendance';
import type { VaultKeys } from '../src/types';

let keys: VaultKeys;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('complete roster preview', () => {
  it('lets teachers inspect every row and search displayed/canonical IDs without narrowing the merge', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<RosterUpload keys={keys} disabled={false} onSaved={onSaved} />);
    const rows = Array.from(
      { length: 45 },
      (_, i) => `00-${i + 1},Synthetic student ${i + 1},${i < 30 ? 'A' : 'B'}`,
    );
    fireEvent.change(screen.getByLabelText('Choose or drop a CSV'), {
      target: { files: [new NodeFile([`id,name,section\n${rows.join('\n')}`], 'roster.csv')] },
    });
    await screen.findByText('Showing 1–20 of 45 matching students (45 total).');
    expect(screen.getByText(/Sections: A: 30 · B: 15/)).toBeTruthy();
    expect(await db.students.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next preview page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next preview page' }));
    await screen.findByText('Showing 41–45 of 45 matching students (45 total).');
    expect(screen.getByText('Synthetic student 45')).toBeTruthy();
    const query = screen.getByLabelText('Search roster preview');
    for (const id of ['00-45', '0045']) {
      fireEvent.change(query, { target: { value: id } });
      expect(screen.getByText('Showing 1–1 of 1 matching students (45 total).')).toBeTruthy();
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save 45 additions and 0 updates' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(await listStudents(keys)).toHaveLength(45);
  });

  it('reparses the selected file after encoding changes and recovers after a decode failure', async () => {
    render(<RosterUpload keys={keys} disabled={false} onSaved={async () => {}} />);
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('id,name,section\n001,Pe'),
      0xf1,
      ...new TextEncoder().encode('a,A'),
    ]);
    fireEvent.change(screen.getByLabelText('Choose or drop a CSV'), {
      target: { files: [new NodeFile([bytes], 'legacy.csv')] },
    });
    await screen.findByText('Peña');
    fireEvent.change(screen.getByLabelText('File encoding'), { target: { value: 'utf-8' } });
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    await waitFor(() =>
      expect(screen.getByLabelText('File encoding').hasAttribute('disabled')).toBe(false),
    );
    expect(screen.queryByRole('button', { name: 'Save 1 additions and 0 updates' })).toBeNull();
    fireEvent.change(screen.getByLabelText('File encoding'), { target: { value: 'windows-1252' } });
    await screen.findByText('Peña');
    expect(screen.getByText(/1 students · windows-1252\./)).toBeTruthy();
    expect(await db.students.count()).toBe(0);
  });
});
