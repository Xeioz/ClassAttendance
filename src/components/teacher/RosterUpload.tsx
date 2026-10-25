import { classStudents, listClasses } from '../../domain/classes';
import { useState, type DragEvent } from 'react';
import { readRoster, type CSVEncoding } from '../../utils/csv';
import { listStudents, saveRoster } from '../../domain/attendance';
import { errorMessage } from '../../utils/errors';
import type { StudentPrivate, VaultKeys } from '../../types';

export function RosterUpload({
  keys,
  onSaved,
  disabled,
  classId,
}: {
  keys: VaultKeys;
  classId?: string;
  onSaved: () => Promise<void>;
  disabled: boolean;
}) {
  const [encoding, setEncoding] = useState<CSVEncoding>('auto');
  const [preview, setPreview] = useState<StudentPrivate[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  async function load(file?: File) {
    if (!file || busy || disabled) return;
    setBusy(true);
    setPreview([]);
    setConflicts([]);
    try {
      const result = await readRoster(file, encoding);
      const existing = await listStudents(keys);
      const current = classId ? await classStudents(keys, classId) : existing;
      const offering = classId
        ? (await listClasses(keys)).find((item) => item.id === classId)
        : undefined;
      const issues: string[] = [];
      let additions = 0;
      for (const row of result.rows) {
        const prior = existing.find((item) => item.id === row.id && item.section === row.section);
        if (prior && prior.name !== row.name.trim())
          issues.push(`${row.id}: existing name is ${prior.name}; file contains ${row.name}.`);
        if (classId && (!offering || row.section !== offering.section))
          issues.push(`${row.id}: section ${row.section} does not match the selected class.`);
        if (!current.some((item) => item.id === row.id && item.section === row.section))
          additions++;
      }
      setConflicts(issues);
      setPreview(result.rows);
      setMessage(
        `${result.rows.length} students · ${result.encoding} · ${additions} additions, ${result.rows.length - additions} existing matches, ${issues.length} conflicts. Omitted enrollment stays unchanged.`,
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
      await saveRoster(keys, preview, classId);
      setPreview([]);
      setMessage(
        'Enrollment saved encrypted. Matching identities were retained; students omitted from this file remain enrolled.',
      );
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
        CSV columns: id, name, section. Import adds enrollment to this class. Existing names must
        match; omitted students are retained. Close active sessions first.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          File encoding
          <select
            value={encoding}
            disabled={busy || disabled}
            onChange={(event) => {
              setEncoding(event.target.value as CSVEncoding);
              setPreview([]);
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
      {conflicts.length > 0 && (
        <div role="alert" className="notice mt-4">
          <p className="font-semibold">Resolve these conflicts in your CSV before saving.</p>
          <ul className="mt-2 max-h-48 overflow-auto">
            {conflicts.map((issue, index) => (
              <li key={index} className="py-1">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.length ? (
        <>
          <div className="mt-4 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">First 20 normalized roster rows</caption>
              <thead>
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Section</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row) => (
                  <tr key={`${row.section}:${row.id}`} className="border-t">
                    <td className="p-2">{row.id}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn mt-4"
            disabled={busy || disabled || conflicts.length > 0}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : `Encrypt and merge ${preview.length} students`}
          </button>
        </>
      ) : null}
    </section>
  );
}
