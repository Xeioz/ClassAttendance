import { useRef, useState, type DragEvent } from 'react';
import { readRoster, type CSVEncoding } from '../../utils/csv';
import { saveRoster } from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import type { StudentPrivate, VaultKeys } from '../../types';

export function RosterUpload({
  keys,
  onSaved,
  disabled,
}: {
  keys: VaultKeys;
  onSaved: () => Promise<void>;
  disabled: boolean;
}) {
  const [encoding, setEncoding] = useState<CSVEncoding>('auto');
  const [preview, setPreview] = useState<StudentPrivate[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const pageSize = 20;
  const search = query.trim().toLowerCase();
  const matches = preview.filter((student) =>
    `${student.displayId ?? ''} ${student.id} ${student.name} ${student.section}`
      .toLowerCase()
      .includes(search),
  );
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  const sectionCounts = new Map<string, number>();
  for (const student of preview)
    sectionCounts.set(student.section, (sectionCounts.get(student.section) ?? 0) + 1);
  async function load(file?: File, selectedEncoding: CSVEncoding = encoding) {
    if (!file || busy || disabled) return;
    setSelectedFile(file);
    setBusy(true);
    setPreview([]);
    setQuery('');
    setPage(0);
    setMessage('Reading roster preview…');
    try {
      const result = await readRoster(file, selectedEncoding);
      setPreview(result.rows);
      setMessage(
        `${result.rows.length} students · ${result.encoding}. Check names and IDs before saving.`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await saveRoster(keys, preview);
      setPreview([]);
      setSelectedFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Roster saved encrypted. Existing IDs in the same section were updated.');
      await onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    void load(event.dataTransfer.files[0]);
  }
  return (
    <section className="card" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <h2 className="text-xl">Class roster</h2>
      <p className="mb-4 mt-2 text-sm text-slate-600">
        CSV columns: id, name, section. Import merges by section and ID. Close active sessions
        first.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          File encoding
          <select
            value={encoding}
            disabled={busy || disabled}
            onChange={(event) => {
              const nextEncoding = event.target.value as CSVEncoding;
              setEncoding(nextEncoding);
              if (selectedFile) void load(selectedFile, nextEncoding);
            }}
          >
            <option value="auto">UTF-8 check / Windows-1252 fallback</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1252">Windows-1252</option>
          </select>
        </label>
        <label>
          Choose or drop a CSV
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={busy || disabled}
            onChange={(event) => void load(event.target.files?.[0])}
          />
        </label>
      </div>
      {message ? (
        <p role="status" className="notice mt-4">
          {message}
        </p>
      ) : null}
      {preview.length ? (
        <>
          <p className="mt-4 text-sm">
            Sections:{' '}
            {[...sectionCounts].map(([section, count]) => `${section}: ${count}`).join(' · ')}.{' '}
            {preview.filter((student) => student.displayId !== student.id).length} IDs use a
            different display spelling from their canonical matching ID. Saving merges all{' '}
            {preview.length} previewed students, including rows outside the current search.
          </p>
          <label className="mt-4">
            Search roster preview
            <input
              type="search"
              value={query}
              disabled={busy}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Display ID, canonical ID, name or section"
            />
          </label>
          <p role="status" className="mt-3 text-sm">
            {matches.length
              ? `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matches.length)} of ${matches.length} matching students (${preview.length} total).`
              : `No matching students (${preview.length} total).`}
          </p>
          <div className="mt-4 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Roster import preview</caption>
              <thead>
                <tr>
                  <th className="p-2">Displayed ID</th>
                  <th className="p-2">Canonical ID</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Section</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={`${row.section}:${row.id}`} className="border-t">
                    <td className="p-2">{row.displayId ?? row.id}</td>
                    <td className="p-2">{row.id}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matches.length > pageSize ? (
            <div className="mt-3 flex flex-wrap gap-3" aria-label="Roster preview pages">
              <button
                className="secondary"
                disabled={busy || page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous preview page
              </button>
              <button
                className="secondary"
                disabled={busy || (page + 1) * pageSize >= matches.length}
                onClick={() => setPage((value) => value + 1)}
              >
                Next preview page
              </button>
            </div>
          ) : null}
          <button className="btn mt-4" disabled={busy || disabled} onClick={() => void save()}>
            {busy ? 'Saving…' : `Encrypt and merge ${preview.length} students`}
          </button>
        </>
      ) : null}
    </section>
  );
}
