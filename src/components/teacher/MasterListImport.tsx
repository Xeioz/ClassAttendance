import { usePagination } from '../../hooks/pagination';
import { Pagination } from '../common/Pagination';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  importMasterList,
  readImportSnapshot,
  type MasterImportResult,
} from '../../domain/importMasterList';
import {
  classIdentity,
  personIdentity,
  type NameApprovals,
  groupMasterRows,
  inspectMasterDraft,
  masterFields,
  type MasterClassDraft,
  type MasterField,
  type MasterIssue,
} from '../../domain/masterListDraft';
import {
  mapMasterSheet,
  readMasterFile,
  suggestMapping,
  type ColumnMapping,
  type MasterSheet,
} from '../../utils/masterList';
import { downloadFile } from '../../utils/download';
import { errorMessage } from '../../utils/errors';
import type { ClassOffering, Student, VaultKeys } from '../../types';

const labels: Record<MasterField, string> = {
  id: 'Student ID',
  name: 'Student name',
  section: 'Section',
  course: 'Course code',
  term: 'Term',
  subject: 'Subject',
  institution: 'Institution',
  room: 'Room',
};
const required = new Set<MasterField>(['id', 'name', 'section', 'course', 'term']);
const pageSize = 25;
export function MasterListImport({
  keys,
  disabled,
  onSaved,
}: {
  keys: VaultKeys;
  disabled: boolean;
  onSaved: (result: MasterImportResult) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState('');
  const [approvals, setApprovals] = useState<NameApprovals>({});
  const [stage, setStage] = useState<'upload' | 'mapping' | 'review' | 'done'>('upload');
  const [sheets, setSheets] = useState<MasterSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(() => suggestMapping([]));
  const [groups, setGroups] = useState<MasterClassDraft[]>([]);
  const [existing, setExisting] = useState<Student[]>([]);
  const [offerings, setOfferings] = useState<ClassOffering[]>([]);
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bulk, setBulk] = useState({ course: '', section: '', term: '', institution: '' });
  const inspection = useMemo(
    () => inspectMasterDraft(groups, existing, approvals),
    [groups, existing, approvals],
  );
  const changes = useMemo(() => {
    const priorByIdentity = new Map(
      existing.map((student) => [personIdentity(student.section, student.id), student]),
    );
    const changes = new Map<string, { id: string; before: string; after: string }>();
    for (const group of groups)
      for (const row of group.students) {
        try {
          const key = personIdentity(group.section, row.id);
          const prior = priorByIdentity.get(key);
          if (prior && prior.name !== row.name.trim())
            changes.set(key, { id: row.id, before: prior.name, after: row.name.trim() });
        } catch {
          /* Invalid IDs remain field errors. */
        }
      }
    return changes;
  }, [groups, existing]);
  const namePages = usePagination([...changes], 25, fileName);
  const group = groups.find((item) => item.key === selected) ?? groups[0];
  const locked = busy || disabled;
  useEffect(() => {
    if (focus) {
      document.getElementById(focus)?.focus();
      setFocus('');
    }
  }, [focus, selected, page]);
  async function load(file?: File) {
    if (!file || locked) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const [loaded, snapshot] = await Promise.all([
        readMasterFile(file),
        readImportSnapshot(keys),
      ]);
      if (!loaded.length) throw new Error('No worksheet contains a header and student rows.');
      setSheets(loaded);
      setSheetIndex(0);
      setMapping(suggestMapping(loaded[0].headers));
      setExisting(snapshot.students);
      setOfferings(snapshot.classes);
      setSnapshot(snapshot.fingerprint);
      setApprovals({});
      setFileName(file.name);
      setStage('mapping');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function preview() {
    setError('');
    try {
      const drafts = groupMasterRows(mapMasterSheet(sheets[sheetIndex], mapping));
      if (drafts.length > 1000)
        throw new Error(
          'This file proposes more than 1,000 class groups. Split it into smaller files or correct the column mapping.',
        );
      setGroups(drafts);
      setSelected(drafts[0]?.key ?? '');
      setPage(0);
      setStage('review');
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  function editGroup(
    field: keyof Omit<MasterClassDraft, 'students' | 'key'>,
    value: string | number,
  ) {
    if (!group) return;
    setGroups((current) =>
      current.map((item) => (item.key === group.key ? { ...item, [field]: value } : item)),
    );
  }
  function editStudent(key: string, field: 'id' | 'name', value: string) {
    if (!group) return;
    setGroups((current) =>
      current.map((item) =>
        item.key === group.key
          ? {
              ...item,
              students: item.students.map((student) =>
                student.key === key ? { ...student, [field]: value } : student,
              ),
            }
          : item,
      ),
    );
  }
  function visitIssue(issue: MasterIssue) {
    setSelected(issue.groupKey);
    const target = groups.find((item) => item.key === issue.groupKey);
    const index = target?.students.findIndex((student) => student.key === issue.rowKey) ?? 0;
    setPage(Math.floor(Math.max(0, index) / pageSize));
    setFocus(`master-${issue.rowKey ?? issue.groupKey}-${issue.field}`);
  }
  async function save() {
    if (locked || inspection.issues.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await importMasterList(keys, groups, {
        expectedSnapshot: snapshot,
        approvals,
      });
      setNotice(
        `Saved ${result.createdClasses} new classes, matched ${result.matchedClasses} existing classes, and added ${result.addedEnrollments} enrollments. Existing enrollment and historical records were retained.`,
      );
      setGroups([]);
      setSheets([]);
      setExisting([]);
      setStage('done');
      await onSaved(result);
    } catch (error) {
      setError(errorMessage(error));
      try {
        const snapshot = await readImportSnapshot(keys);
        setExisting(snapshot.students);
        setOfferings(snapshot.classes);
        setSnapshot(snapshot.fingerprint);
        setApprovals({});
      } catch {
        /* Keep the original save error and the editable draft. */
      }
    } finally {
      setBusy(false);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    void load(event.dataTransfer.files[0]);
  }
  function template(complete: boolean) {
    const header = complete
      ? 'id,name,section,course,term,subject,institution,room'
      : 'id,name,section';
    downloadFile(
      new Blob(['\uFEFF' + header + '\r\n'], { type: 'text/csv;charset=utf-8' }),
      complete ? 'master-list-complete-template.csv' : 'master-list-basic-template.csv',
    );
  }
  return (
    <section className="grid gap-5" aria-label="Master list import">
      <div className="card">
        <p className="eyebrow">Start with your master list</p>
        <h2 className="mt-2 text-2xl">Import students and set up classes</h2>
        <p className="mt-3 text-sm text-slate-600">
          Upload once, review the detected classes, and fill any blank required fields before
          saving. Nothing is saved until you confirm the completed preview.
        </p>
        <ol aria-label="Import progress" className="stepbar mt-5">
          <li aria-current={stage === 'upload' ? 'step' : undefined}>1. Upload</li>
          <li aria-current={stage === 'mapping' ? 'step' : undefined}>2. Match columns</li>
          <li aria-current={stage === 'review' ? 'step' : undefined}>3. Complete & review</li>
          <li aria-current={stage === 'done' ? 'step' : undefined}>4. Saved</li>
        </ol>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
          {groups.length > 0 ? ' Your preview corrections are kept on this screen.' : ''}
        </p>
      )}
      {disabled && !busy && (
        <p className="notice">
          Import is paused while an attendance session or another teacher operation is active.
          Finish it before importing.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-700 bg-emerald-50 p-4">
          {notice}
        </p>
      )}
      {stage === 'upload' && (
        <div
          className="card grid gap-5"
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          <label>
            Choose or drop your master list
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={locked}
              onChange={(event) => void load(event.target.files?.[0])}
            />
          </label>
          <p className="text-sm text-slate-600">
            CSV or Excel · up to 5 MB / 10,000 enrollment rows. The first non-empty row must contain
            column headings. For Excel, you can choose a worksheet next. CSV supports UTF-8 and
            Windows-1252 fallback; check accented names in the preview.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="secondary" disabled={locked} onClick={() => template(false)}>
              Download basic CSV template
            </button>
            <button className="secondary" disabled={locked} onClick={() => template(true)}>
              Download complete CSV template
            </button>
          </div>
          <p className="text-sm">
            Basic: ID, name, section. Complete: add course and term to propose classes
            automatically. Missing required columns can be completed in the preview.
          </p>
        </div>
      )}
      {stage === 'mapping' && (
        <div className="card grid gap-5">
          <h3 className="text-xl">Match your columns</h3>
          <p className="text-sm">
            {fileName}. We matched recognized headings. Leave unavailable fields unmapped; they will
            be blank in the preview.
          </p>
          {sheets.length > 1 && (
            <label>
              Excel worksheet
              <select
                disabled={locked}
                value={sheetIndex}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setSheetIndex(index);
                  setMapping(suggestMapping(sheets[index].headers));
                }}
              >
                {sheets.map((sheet, index) => (
                  <option key={sheet.name} value={index}>
                    {sheet.name} ({sheet.rows.length} rows)
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {masterFields.map((field) => (
              <label key={field}>
                {labels[field]} {required.has(field) ? '(required before saving)' : '(optional)'}
                <select
                  disabled={locked}
                  value={mapping[field]}
                  onChange={(event) =>
                    setMapping({ ...mapping, [field]: Number(event.target.value) })
                  }
                >
                  <option value={-1}>Not in file — fill later</option>
                  {sheets[sheetIndex].headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header} · column {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <details>
            <summary className="min-h-12 cursor-pointer py-3 font-semibold">
              See first 3 source rows
            </summary>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {sheets[sheetIndex].headers.map((header, index) => (
                      <th key={index} className="p-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheets[sheetIndex].rows.slice(0, 3).map((row, index) => (
                    <tr key={index}>
                      {sheets[sheetIndex].headers.map((_, column) => (
                        <td className="p-2" key={column}>
                          {row[column] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="flex flex-wrap gap-3">
            <button className="btn" disabled={locked} onClick={preview}>
              {groups.length ? 'Rebuild preview (replaces edits)' : 'Review detected classes'}
            </button>
            <button className="secondary" disabled={locked} onClick={() => setStage('upload')}>
              Choose another file
            </button>
          </div>
        </div>
      )}
      {stage === 'review' && (
        <div className="grid items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="card hidden min-w-0 xl:block" aria-label="Imported classes">
            <h3 className="mb-4 text-sm font-semibold">Imported classes</h3>
            <div className="grid max-h-[32rem] gap-2 overflow-y-auto">
              {groups.map((item, index) => {
                const count = inspection.issues.filter(
                  (issue) => issue.groupKey === item.key,
                ).length;
                return (
                  <button
                    key={item.key}
                    className={`min-h-12 rounded-xl border p-3 text-left ${group?.key === item.key ? 'border-forest bg-emerald-50' : 'border-slate-200'}`}
                    aria-current={group?.key === item.key ? 'true' : undefined}
                    disabled={locked}
                    onClick={() => {
                      setSelected(item.key);
                      setPage(0);
                    }}
                  >
                    <strong className="block text-sm">
                      Class {index + 1} · {item.section || 'Section missing'}
                    </strong>
                    <span className="mt-1 block text-xs font-normal">
                      {item.students.length} students ·{' '}
                      {count ? `${count} issues` : 'Ready to save'}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
          <div className="grid min-w-0 gap-5">
            <section className="card grid gap-4">
              <h3 className="text-xl">Complete the missing details</h3>
              <p>
                {inspection.total} enrollment rows · {inspection.classes.length} proposed classes ·{' '}
                <strong>{inspection.issues.length} issues to resolve</strong>
              </p>
              <p className="text-sm text-slate-600">
                Required: course, section, term, student ID and name. Optional fields may stay
                blank. The same student may appear in different classes; duplicate enrollment within
                one class must be corrected.
              </p>
              <details>
                <summary className="min-h-12 cursor-pointer py-3 font-semibold">
                  Fill shared blanks across all classes
                </summary>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(['course', 'section', 'term', 'institution'] as const).map((field) => (
                    <label key={field}>
                      Shared {labels[field]}
                      <input
                        value={bulk[field]}
                        disabled={locked}
                        maxLength={field === 'institution' || field === 'term' ? 150 : 100}
                        onChange={(event) => setBulk({ ...bulk, [field]: event.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="secondary mt-4"
                  disabled={locked}
                  onClick={() =>
                    setGroups((current) =>
                      current.map((item) => ({
                        ...item,
                        ...Object.fromEntries(
                          Object.entries(bulk).filter(
                            ([field, value]) =>
                              value.trim() && !String(item[field as keyof typeof bulk]).trim(),
                          ),
                        ),
                      })),
                    )
                  }
                >
                  Apply only to blank fields
                </button>
              </details>
              {changes.size > 0 && (
                <div className="rounded-xl border border-amber-300 p-4">
                  <h4 className="font-semibold">Review name changes</h4>
                  <p className="my-2 text-sm">
                    Updates affect the current student record in every enrolled class. Historical
                    session rosters stay unchanged.
                  </p>
                  {namePages.visible.map(([key, change]) => (
                    <label key={key} className="my-3 flex min-h-12 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-6 min-h-0 w-6 shrink-0"
                        disabled={locked}
                        checked={
                          approvals[key]?.before === change.before &&
                          approvals[key]?.after === change.after
                        }
                        onChange={(event) =>
                          setApprovals((current) => {
                            const next = { ...current };
                            if (event.target.checked)
                              next[key] = { before: change.before, after: change.after };
                            else delete next[key];
                            return next;
                          })
                        }
                      />
                      <span>
                        {change.id}: “{change.before}” → “{change.after}”
                        <span className="block text-xs font-normal">Approve this change</span>
                      </span>
                    </label>
                  ))}
                  <Pagination
                    page={namePages.page}
                    pageSize={25}
                    count={changes.size}
                    label="Name change review pages"
                    onPage={namePages.setPage}
                  />
                </div>
              )}
              {inspection.issues.length > 0 && (
                <div aria-label="Import issues" className="notice">
                  <p className="font-semibold">Complete these fields before saving:</p>
                  <ul className="mt-2 max-h-64 overflow-auto">
                    {inspection.issues.slice(0, 100).map((issue, index) => (
                      <li key={`${issue.groupKey}:${issue.rowKey}:${issue.field}:${index}`}>
                        <button
                          className="min-h-12 text-left underline"
                          disabled={locked}
                          onClick={() => visitIssue(issue)}
                        >
                          {issue.groupKey
                            ? `Class ${groups.findIndex((item) => item.key === issue.groupKey) + 1}: `
                            : ''}
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {inspection.issues.length > 100 && (
                    <p>
                      Showing the first 100 issues. Remaining issues appear as these are corrected.
                    </p>
                  )}
                </div>
              )}
              <label className="xl:hidden">
                Class to review
                <select
                  disabled={locked}
                  value={group?.key ?? ''}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setPage(0);
                  }}
                >
                  {groups.map((item, index) => (
                    <option key={item.key} value={item.key}>
                      Class {index + 1}: {item.course || '[Course missing]'} /{' '}
                      {item.section || '[Section missing]'} / {item.term || '[Term missing]'} ·{' '}
                      {item.students.length} students
                    </option>
                  ))}
                </select>
              </label>
            </section>
            {group && (
              <section className="card grid gap-5">
                <h3 className="text-xl">Class details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(['course', 'section', 'term', 'subject', 'institution', 'room'] as const).map(
                    (field) => (
                      <label key={field} htmlFor={`master-${group.key}-${field}`}>
                        {labels[field]} {required.has(field) ? '*' : '(optional)'}
                        <input
                          id={`master-${group.key}-${field}`}
                          aria-label={`${labels[field]} ${required.has(field) ? '*' : '(optional)'}`}
                          value={group[field]}
                          aria-required={required.has(field)}
                          aria-describedby={`master-${group.key}-${field}-error`}
                          aria-invalid={inspection.issues.some(
                            (issue) =>
                              issue.groupKey === group.key &&
                              !issue.rowKey &&
                              issue.field === field,
                          )}
                          maxLength={field === 'course' || field === 'section' ? 100 : 150}
                          disabled={locked}
                          placeholder={
                            required.has(field) && !group[field]
                              ? 'Missing — please fill in'
                              : undefined
                          }
                          onChange={(event) => editGroup(field, event.target.value)}
                        />
                        <span id={`master-${group.key}-${field}-error`} className="field-error">
                          {inspection.issues
                            .filter(
                              (issue) =>
                                issue.groupKey === group.key &&
                                !issue.rowKey &&
                                issue.field === field,
                            )
                            .map((issue) => issue.message)
                            .join(' ')}
                        </span>
                      </label>
                    ),
                  )}
                </div>
                {offerings.some((item) => classIdentity(item) === classIdentity(group)) && (
                  <p className="notice">
                    This matches an existing class. Enrollment will be added to it; its saved
                    defaults and existing enrollment are retained.
                  </p>
                )}
                <details>
                  <summary className="min-h-12 cursor-pointer py-3 font-semibold">
                    Optional session defaults
                  </summary>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      Grace period (minutes)
                      <input
                        id={`master-${group.key}-graceMinutes`}
                        disabled={locked}
                        type="number"
                        min={0}
                        max={180}
                        value={group.graceMinutes}
                        onChange={(event) => editGroup('graceMinutes', Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Report timezone
                      <input
                        id={`master-${group.key}-timezone`}
                        disabled={locked}
                        value={group.timezone ?? ''}
                        onChange={(event) => editGroup('timezone', event.target.value)}
                      />
                    </label>
                  </div>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl">Student rows</h3>
                  <button
                    className="secondary"
                    disabled={locked}
                    onClick={() => {
                      setGroups((current) => current.filter((item) => item.key !== group.key));
                      setPage(0);
                    }}
                  >
                    Remove this class from preview
                  </button>
                </div>
                <div className="grid gap-4">
                  {group.students.slice(page * pageSize, (page + 1) * pageSize).map((student) => (
                    <div
                      key={student.key}
                      className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_2fr_auto]"
                    >
                      <label htmlFor={`master-${student.key}-id`}>
                        Student ID · file row {student.sourceRow}
                        <input
                          id={`master-${student.key}-id`}
                          aria-label={`Student ID · file row ${student.sourceRow}`}
                          aria-describedby={`master-${student.key}-id-error`}
                          disabled={locked}
                          aria-required="true"
                          aria-invalid={inspection.issues.some(
                            (issue) => issue.rowKey === student.key && issue.field === 'id',
                          )}
                          value={student.id}
                          maxLength={64}
                          placeholder={!student.id ? 'Missing — enter ID' : undefined}
                          onChange={(event) => editStudent(student.key, 'id', event.target.value)}
                        />
                        <span id={`master-${student.key}-id-error`} className="field-error">
                          {inspection.issues
                            .filter((issue) => issue.rowKey === student.key && issue.field === 'id')
                            .map((issue) => issue.message)
                            .join(' ')}
                        </span>
                      </label>
                      <label htmlFor={`master-${student.key}-name`}>
                        Student name · file row {student.sourceRow}
                        <input
                          id={`master-${student.key}-name`}
                          aria-label={`Student name · file row ${student.sourceRow}`}
                          aria-describedby={`master-${student.key}-name-error`}
                          disabled={locked}
                          aria-required="true"
                          aria-invalid={inspection.issues.some(
                            (issue) => issue.rowKey === student.key && issue.field === 'name',
                          )}
                          value={student.name}
                          maxLength={200}
                          placeholder={!student.name ? 'Missing — enter name' : undefined}
                          onChange={(event) => editStudent(student.key, 'name', event.target.value)}
                        />
                        <span id={`master-${student.key}-name-error`} className="field-error">
                          {inspection.issues
                            .filter(
                              (issue) => issue.rowKey === student.key && issue.field === 'name',
                            )
                            .map((issue) => issue.message)
                            .join(' ')}
                        </span>
                      </label>
                      <button
                        className="secondary self-end"
                        disabled={locked}
                        aria-label={`Remove file row ${student.sourceRow}`}
                        onClick={() => {
                          setGroups((current) =>
                            current.map((item) =>
                              item.key === group.key
                                ? {
                                    ...item,
                                    students: item.students.filter(
                                      (row) => row.key !== student.key,
                                    ),
                                  }
                                : item,
                            ),
                          );
                          setPage(0);
                        }}
                      >
                        Remove row
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="secondary"
                    disabled={locked || page === 0}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous rows
                  </button>
                  <span className="text-sm">
                    Page {page + 1} of {Math.max(1, Math.ceil(group.students.length / pageSize))}
                  </span>
                  <button
                    className="secondary"
                    disabled={locked || (page + 1) * pageSize >= group.students.length}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next rows
                  </button>
                </div>
              </section>
            )}
            <section className="card">
              <p className="mb-4 text-sm">
                Saving creates or matches classes by course + section + term, then adds enrollment.
                Historical attendance is unchanged. Your unsaved preview stays only in this unlocked
                page; leaving it discards the draft.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn"
                  disabled={locked || inspection.issues.length > 0}
                  onClick={() => void save()}
                >
                  {busy ? 'Encrypting and saving…' : 'Confirm and save master list'}
                </button>
                <button className="secondary" disabled={locked} onClick={() => setStage('mapping')}>
                  Back to columns
                </button>
              </div>
              {inspection.issues.length > 0 && (
                <p className="mt-3 text-sm font-semibold">
                  Save is unavailable until all required fields and conflicts are resolved.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
      {stage === 'done' && (
        <section className="card">
          <h3 className="text-xl">Your classes are ready</h3>
          <p className="my-3">
            Choose a class from the class list to review enrollment or start attendance.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setStage('upload');
              setNotice('');
            }}
          >
            Import another master list
          </button>
        </section>
      )}
      {busy && stage !== 'review' && <p role="status">Reading and preparing your file…</p>}
    </section>
  );
}
