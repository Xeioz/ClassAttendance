import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { inspectRoster, type CSVEncoding } from '../../utils/csv';
import {
  commitRosterImport,
  prepareRosterImport,
  rosterCategories,
  type RosterCategory,
  type RosterReview,
} from '../../domain/rosterImport';
import { StaleRosterPreviewError } from '../../domain/rosterSnapshot';
import { errorMessage } from '../../utils/errors';
import { t } from '../../i18n';
import type { VaultKeys } from '../../types';

export interface RosterReviewState {
  pending: boolean;
  blockingIssues: number;
  changes: number;
}

export function RosterUpload({
  keys,
  onSaved,
  disabled,
  onReviewStateChange,
}: {
  keys: VaultKeys;
  onSaved: () => Promise<void>;
  disabled: boolean;
  onReviewStateChange?: (state: RosterReviewState) => void;
}) {
  const [encoding, setEncoding] = useState<CSVEncoding>('auto');
  const [review, setReview] = useState<RosterReview>();
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RosterCategory | 'all'>('all');
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  const actionPending = useRef(false);
  const descriptionId = useId();
  const pageSize = 20;
  const pending = !!selectedFile;
  const unapproved =
    review?.rows.filter((row) => row.category === 'updated' && !approved.has(row.line)).length ?? 0;
  const blockingIssues = review
    ? review.counts.invalid + review.counts.conflict + unapproved
    : pending
      ? 1
      : 0;
  const changes = review ? review.counts.added + review.counts.updated : 0;
  useEffect(() => {
    onReviewStateChange?.({ pending, blockingIssues, changes });
  }, [pending, blockingIssues, changes, onReviewStateChange]);
  useEffect(() => {
    if (review) summary.current?.focus();
  }, [review]);

  const search = query.trim().toLowerCase();
  const matches = (review?.rows ?? []).filter((row) => {
    const student = row.student ?? row.raw;
    const before = row.before;
    return (
      (category === 'all' || row.category === category) &&
      `${row.line} ${row.raw.id} ${student.id} ${student.name} ${student.section} ${before?.displayId ?? ''} ${before?.name ?? ''}`
        .toLowerCase()
        .includes(search)
    );
  });
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  const sectionCounts = new Map<string, number>();
  for (const row of review?.rows ?? []) {
    const section = row.student?.section ?? row.raw.section.trim();
    if (section) sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
  }

  function resetReview() {
    setReview(undefined);
    setApproved(new Set());
    setQuery('');
    setCategory('all');
    setPage(0);
  }
  async function load(file?: File, selectedEncoding: CSVEncoding = encoding) {
    if (!file || actionPending.current || disabled) return;
    actionPending.current = true;
    setSelectedFile(file);
    setBusy(true);
    resetReview();
    setHasError(false);
    setMessage(t('roster.reading'));
    try {
      const inspection = await inspectRoster(file, selectedEncoding);
      const comparison = await prepareRosterImport(keys, inspection);
      setReview(comparison);
      setMessage(
        t('roster.loaded', { count: inspection.rows.length, encoding: inspection.encoding }),
      );
    } catch (error) {
      setHasError(true);
      setMessage(errorMessage(error));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  function cancel() {
    if (actionPending.current) return;
    resetReview();
    setSelectedFile(undefined);
    if (fileInput.current) fileInput.current.value = '';
    setHasError(false);
    setMessage(t('roster.cancelled'));
    if (fileInput.current?.disabled) document.getElementById('class-roster')?.focus();
    else fileInput.current?.focus();
  }
  async function save() {
    if (!review || actionPending.current || disabled || blockingIssues) return;
    actionPending.current = true;
    setBusy(true);
    setHasError(false);
    try {
      const counts = await commitRosterImport(keys, review, approved);
      resetReview();
      setSelectedFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setMessage(t('roster.saved', counts));
      await onSaved();
    } catch (error) {
      setHasError(true);
      if (error instanceof StaleRosterPreviewError) {
        // Never reuse earlier approvals after another operation changed the roster.
        setApproved(new Set());
        setQuery('');
        setCategory('all');
        setPage(0);
        try {
          setReview(await prepareRosterImport(keys, review.inspection));
          setMessage(t('roster.refreshed'));
        } catch (refreshError) {
          setReview(undefined);
          setMessage(errorMessage(refreshError));
        }
      } else setMessage(errorMessage(error));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    void load(event.dataTransfer.files[0]);
  }
  return (
    <section
      id="class-roster"
      tabIndex={-1}
      className="card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      aria-busy={busy}
    >
      <h2 className="text-xl">{t('roster.title')}</h2>
      <p id={descriptionId} className="mb-4 mt-2 text-sm text-slate-600">
        {t('roster.description')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          {t('roster.encoding')}
          <select
            value={encoding}
            disabled={busy || disabled}
            onChange={(event) => {
              const nextEncoding = event.target.value as CSVEncoding;
              setEncoding(nextEncoding);
              if (selectedFile) void load(selectedFile, nextEncoding);
            }}
          >
            <option value="auto">{t('roster.encodingAuto')}</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1252">Windows-1252</option>
          </select>
        </label>
        <label>
          {t('roster.chooseFile')}
          <input
            id="roster-import-file"
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={busy || disabled}
            aria-describedby={descriptionId}
            onChange={(event) => void load(event.target.files?.[0])}
          />
        </label>
      </div>
      {message ? (
        <p role={hasError ? 'alert' : 'status'} className="notice mt-4">
          {message}
        </p>
      ) : null}
      {review ? (
        <>
          <p ref={summary} tabIndex={-1} role="status" className="mt-4 font-medium">
            {t('roster.total', { count: review.rows.length })}{' '}
            {rosterCategories
              .map((kind) =>
                t('roster.categoryCount', {
                  category: t(`roster.category.${kind}`),
                  count: review.counts[kind],
                }),
              )
              .join(' · ')}
          </p>
          <p className="mt-2 text-sm">
            {t('roster.proposed', { added: review.counts.added, updated: review.counts.updated })}
          </p>
          <p className="mt-2 text-sm">
            {t('roster.sections', {
              sections: [...sectionCounts]
                .map(([section, count]) => `${section}: ${count}`)
                .join(' · '),
            })}
          </p>
          <p className="mt-2 text-sm">{t('roster.scope')}</p>
          {review.counts.invalid + review.counts.conflict > 0 ? (
            <p role="alert" className="notice mt-3">
              {t('roster.blockingRule')}
            </p>
          ) : null}
          {review.counts.updated > 0 ? (
            <p className="notice mt-3">{t('roster.confirmIdentity', { count: unapproved })}</p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              {t('roster.search')}
              <input
                type="search"
                value={query}
                disabled={busy}
                placeholder={t('roster.searchPlaceholder')}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              {t('roster.filter')}
              <select
                value={category}
                disabled={busy}
                onChange={(event) => {
                  setCategory(event.target.value as RosterCategory | 'all');
                  setPage(0);
                }}
              >
                <option value="all">{t('roster.allRows')}</option>
                {rosterCategories.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`roster.category.${kind}`)} ({review.counts[kind]})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status" className="mt-3 text-sm">
            {matches.length
              ? t('roster.showing', {
                  first: page * pageSize + 1,
                  last: Math.min((page + 1) * pageSize, matches.length),
                  matches: matches.length,
                  total: review.rows.length,
                })
              : t('roster.noMatches', { total: review.rows.length })}
          </p>
          <div
            className="mt-4 max-h-96 overflow-auto"
            role="region"
            aria-label={t('roster.tableRegion')}
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('roster.tableCaption')}</caption>
              <thead>
                <tr>
                  {['row', 'category', 'displayId', 'canonicalId', 'name', 'section', 'review'].map(
                    (key) => (
                      <th scope="col" className="p-2" key={key}>
                        {t(`roster.column.${key}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const student = row.student ?? row.raw;
                  return (
                    <tr key={row.line} className="border-t">
                      <th scope="row" className="p-2">
                        {row.line}
                      </th>
                      <td className="p-2">{t(`roster.category.${row.category}`)}</td>
                      <td className="p-2">
                        {row.category === 'updated' ? (
                          <>
                            <div>
                              {t('roster.before', {
                                value: row.before?.displayId ?? row.before?.id ?? '',
                              })}
                            </div>
                            <div>
                              {t('roster.after', { value: row.student?.displayId ?? row.raw.id })}
                            </div>
                          </>
                        ) : (
                          (row.student?.displayId ?? row.raw.id)
                        )}
                      </td>
                      <td className="p-2">{row.student?.id ?? '—'}</td>
                      <td className="p-2">
                        {row.category === 'updated' ? (
                          <>
                            <div>{t('roster.before', { value: row.before?.name ?? '' })}</div>
                            <div>{t('roster.after', { value: student.name })}</div>
                          </>
                        ) : (
                          student.name || '—'
                        )}
                      </td>
                      <td className="p-2">{student.section || '—'}</td>
                      <td className="min-w-56 p-2">
                        {row.issue ||
                          (row.category === 'updated' ? (
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-1 w-auto"
                                checked={approved.has(row.line)}
                                disabled={busy || disabled}
                                onChange={(event) =>
                                  setApproved((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(row.line);
                                    else next.delete(row.line);
                                    return next;
                                  })
                                }
                              />
                              {t('roster.approveRow', { row: row.line, id: student.id })}
                            </label>
                          ) : (
                            t('roster.noAction')
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {matches.length > pageSize ? (
            <div className="mt-3 flex flex-wrap gap-3" aria-label={t('roster.pages')}>
              <button
                className="secondary"
                disabled={busy || page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('roster.previous')}
              </button>
              <button
                className="secondary"
                disabled={busy || (page + 1) * pageSize >= matches.length}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('roster.next')}
              </button>
            </div>
          ) : null}
          <button
            className="btn mt-4"
            disabled={busy || disabled || blockingIssues > 0}
            onClick={() => void save()}
          >
            {busy
              ? t('roster.saving')
              : t('roster.save', { added: review.counts.added, updated: review.counts.updated })}
          </button>
        </>
      ) : null}
      {selectedFile ? (
        <button className="secondary ml-3 mt-4" disabled={busy} onClick={cancel}>
          {t('roster.cancel')}
        </button>
      ) : null}
    </section>
  );
}
