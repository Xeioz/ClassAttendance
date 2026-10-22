// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RosterUpload } from '../src/components/teacher/RosterUpload';
import { saveRoster } from '../src/domain/attendance';
import type { VaultKeys } from '../src/types';

vi.mock('../src/domain/attendance', () => ({ saveRoster: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('complete roster preview', () => {
  it('lets teachers inspect every row and search displayed/canonical IDs without narrowing the merge', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<RosterUpload keys={{} as VaultKeys} disabled={false} onSaved={onSaved} />);
    const rows = Array.from(
      { length: 45 },
      (_, i) => `00-${i + 1},Synthetic student ${i + 1},${i < 30 ? 'A' : 'B'}`,
    );
    fireEvent.change(screen.getByLabelText('Choose or drop a CSV'), {
      target: { files: [new NodeFile([`id,name,section\n${rows.join('\n')}`], 'roster.csv')] },
    });
    await screen.findByText('Showing 1–20 of 45 matching students (45 total).');
    expect(screen.getByText(/Sections: A: 30 · B: 15/)).toBeTruthy();
    expect(saveRoster).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Encrypt and merge 45 students' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(vi.mocked(saveRoster).mock.calls[0][1]).toHaveLength(45);
  });

  it('reparses the selected file after encoding changes and recovers after a decode failure', async () => {
    render(<RosterUpload keys={{} as VaultKeys} disabled={false} onSaved={async () => {}} />);
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
    expect(screen.queryByRole('button', { name: 'Encrypt and merge 1 students' })).toBeNull();
    fireEvent.change(screen.getByLabelText('File encoding'), { target: { value: 'windows-1252' } });
    await screen.findByText('Peña');
    expect(screen.getByText(/1 students · windows-1252\./)).toBeTruthy();
    expect(saveRoster).not.toHaveBeenCalled();
  });
});
