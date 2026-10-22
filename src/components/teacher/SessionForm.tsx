import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createSession } from '../../domain/attendance';
import {
  ClassSettingsValidationError,
  validateClassSettings,
  validateTemplateName,
} from '../../domain/classSettings';
import {
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  saveTemplate,
} from '../../domain/templates';
import { t } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { sectionKey } from '../../utils/normalize';
import type { ClassSettings, ClassTemplate, Session, Student, VaultKeys } from '../../types';
import { PreClassReadiness } from './PreClassReadiness';

function localMinute(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function initialSettings(): ClassSettings {
  return {
    course: '',
    section: '',
    graceMinutes: 15,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
type FormError = { field?: string; message: string };

export function SessionForm({
  keys,
  sections,
  students = [],
  activeSession,
  rosterReviewPending = false,
  rosterReviewIssues = 0,
  onRosterChanged,
  onReviewActiveSession,
  onCreated,
}: {
  keys: VaultKeys;
  sections: string[];
  students?: Student[];
  activeSession?: Session;
  rosterReviewPending?: boolean;
  rosterReviewIssues?: number;
  onRosterChanged?: () => Promise<void>;
  onReviewActiveSession?: () => void;
  onCreated: (session: Session) => Promise<void>;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<ClassSettings>(initialSettings);
  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [selected, setSelected] = useState<ClassTemplate>();
  const [sectionEdited, setSectionEdited] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<ClassTemplate>();
  const [pin, setPin] = useState('');
  const [start, setStart] = useState(localMinute);
  const [error, setError] = useState<FormError>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sectionInput = settings.section || (!sectionEdited ? sections[0] || '' : '');
  const section = sectionKey(sectionInput);
  const selectedId = selected?.id ?? '';
  const rosterCount = students.filter((student) => student.section === section).length;
  const sectionMissing = !!section && !sections.includes(section);
  const startsAt = new Date(start).getTime();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTemplates(keys)
      .then((result) => {
        if (!cancelled) setTemplates(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError({ message: errorMessage(cause) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keys]);

  function focusField(field: string) {
    const control = formRef.current?.elements.namedItem(field);
    if (control instanceof HTMLElement) control.focus();
  }
  function showError(cause: unknown) {
    const problem =
      cause instanceof ClassSettingsValidationError
        ? { field: cause.field, message: cause.message }
        : cause &&
            typeof cause === 'object' &&
            'message' in cause &&
            typeof cause.message === 'string'
          ? (cause as FormError)
          : { message: errorMessage(cause) };
    setError(problem);
    if (problem.field) focusField(problem.field);
  }
  function edit<K extends keyof ClassSettings>(field: K, value: ClassSettings[K]) {
    if (field === 'section') setSectionEdited(true);
    setSettings((current) => ({ ...current, [field]: value }));
    setError(undefined);
    setMessage('');
  }
  function useTemplate(template?: ClassTemplate) {
    setSelected(template);
    setSectionEdited(!!template);
    setName(template?.name ?? '');
    setSettings(template ? { ...template.settings } : initialSettings());
    setPin('');
    setStart(localMinute());
    setError(undefined);
    setMessage(template ? t('templates.loaded', { name: template.name }) : '');
    setRemoving(undefined);
  }
  async function refreshTemplates() {
    setTemplates(await listTemplates(keys));
  }
  async function save(update: boolean) {
    setError(undefined);
    setMessage('');
    try {
      const templateName = validateTemplateName(name);
      const validated = validateClassSettings({ ...settings, section });
      setBusy(true);
      const saved = await saveTemplate(keys, {
        id: update ? selectedId : undefined,
        expectedUpdatedAt: update ? selected?.updatedAt : undefined,
        name: templateName,
        settings: validated,
      });
      await refreshTemplates();
      setSelected(saved);
      setSectionEdited(true);
      setName(saved.name);
      setSettings({ ...saved.settings });
      setMessage(t(update ? 'templates.updated' : 'templates.saved', { name: saved.name }));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    if (!selected) return;
    setError(undefined);
    setMessage('');
    setBusy(true);
    try {
      const copy = await duplicateTemplate(keys, selected.id);
      await refreshTemplates();
      useTemplate(copy);
      setMessage(t('templates.duplicated', { name: copy.name }));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function reloadSelected() {
    setBusy(true);
    setError(undefined);
    try {
      const latest = await listTemplates(keys);
      setTemplates(latest);
      useTemplate(latest.find((template) => template.id === selectedId));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setError(undefined);
    setMessage('');
    setBusy(true);
    try {
      await deleteTemplate(keys, removing.id, removing.updatedAt);
      await refreshTemplates();
      setSelected(undefined);
      setRemoving(undefined);
      setMessage(t('templates.removed', { name: removing.name }));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (removing) focusField('keepTemplate');
  }, [removing]);
  useEffect(() => {
    if (error?.field && !busy) focusField(error.field);
  }, [error, busy]);
  const previousRemoval = useRef(false);
  useEffect(() => {
    if (previousRemoval.current && !removing && !busy) focusField('savedTemplate');
    if (!busy) previousRemoval.current = !!removing;
  }, [removing, busy]);

  function configurationError(): FormError | undefined {
    try {
      validateClassSettings({ ...settings, section });
    } catch (cause) {
      return {
        field: cause instanceof ClassSettingsValidationError ? cause.field : undefined,
        message: errorMessage(cause),
      };
    }
    if (!Number.isFinite(startsAt) || localMinute(new Date(startsAt)) !== start)
      return { field: 'startsAt', message: t('templates.invalidStart') };
    if (!/^\d{3,6}$/.test(pin)) return { field: 'roomPin', message: t('templates.invalidPin') };
  }
  const configProblem = configurationError();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || removing) return;
    setError(undefined);
    setMessage('');
    if (activeSession) {
      showError({ message: t('templates.activeSession') });
      return;
    }
    if (rosterReviewPending) {
      showError({ message: t('templates.pendingRoster') });
      return;
    }
    if (configProblem) {
      showError(configProblem);
      return;
    }
    if (sectionMissing || !rosterCount) {
      showError({ field: 'section', message: t('templates.emptySection', { section }) });
      return;
    }
    setBusy(true);
    try {
      const session = await createSession(
        keys,
        {
          ...validateClassSettings({ ...settings, section }),
          roomPin: pin,
          startsAt,
        },
        { expectedRoster: students },
      );
      setPin('');
      setStart(localMinute());
      setMessage(t('templates.sessionCreated'));
      await onCreated(session);
    } catch (cause) {
      if (
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code === 'ROSTER_CHANGED'
      ) {
        try {
          await onRosterChanged?.();
        } catch {
          /* Keep the actionable original conflict; never automatically retry creation. */
        }
      }
      showError(cause);
    } finally {
      setBusy(false);
    }
  }
  function fieldProps(field: string) {
    return {
      id: `${id}-${field}`,
      name: field,
      'aria-invalid': error?.field === field || undefined,
      'aria-describedby': error?.field === field ? `${id}-error` : undefined,
    };
  }
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const controlsDisabled = busy || !!removing;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="card grid gap-4"
      aria-labelledby={`${id}-heading`}
    >
      <div>
        <p className="eyebrow">{t('templates.beforeScanning')}</p>
        <h2 id={`${id}-heading`} className="mt-2 text-xl">
          {t('templates.heading')}
        </h2>
      </div>
      <fieldset
        disabled={controlsDisabled || loading}
        className="grid gap-3 rounded-xl border border-slate-300 p-4"
      >
        <legend className="px-1 font-semibold">{t('templates.savedHeading')}</legend>
        <p className="text-sm text-slate-600">{t('templates.description')}</p>
        <label htmlFor={`${id}-savedTemplate`}>
          {t('templates.choose')}
          <select
            {...fieldProps('savedTemplate')}
            value={selectedId}
            onChange={(event) =>
              useTemplate(templates.find((item) => item.id === event.target.value))
            }
          >
            <option value="">{loading ? t('templates.loading') : t('templates.noTemplate')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-name`}>
          {t('templates.name')}
          <input
            {...fieldProps('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
              setMessage('');
            }}
            maxLength={100}
          />
        </label>
        <p className="text-sm text-slate-600">{t('templates.editHelp')}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn secondary" onClick={() => void save(false)}>
            {t(selected ? 'templates.saveAsNew' : 'templates.saveNew')}
          </button>
          {selected ? (
            <>
              <button type="button" className="btn secondary" onClick={() => void save(true)}>
                {t('templates.update')}
              </button>
              <button type="button" className="btn secondary" onClick={() => void reloadSelected()}>
                {t('templates.reload')}
              </button>
              <button type="button" className="btn secondary" onClick={() => void duplicate()}>
                {t('templates.duplicate')}
              </button>
              <button type="button" className="btn secondary" onClick={() => setRemoving(selected)}>
                {t('templates.remove')}
              </button>
            </>
          ) : null}
        </div>
        {selected ? <p className="text-sm text-slate-600">{t('templates.duplicateHelp')}</p> : null}
      </fieldset>
      {removing ? (
        <div className="notice grid gap-3" role="group" aria-labelledby={`${id}-remove-heading`}>
          <p id={`${id}-remove-heading`}>{t('templates.removePrompt', { name: removing.name })}</p>
          <p>{t('templates.removeHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              name="keepTemplate"
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => setRemoving(undefined)}
            >
              {t('templates.keep')}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t('templates.confirmRemove')}
            </button>
          </div>
        </div>
      ) : null}
      <fieldset disabled={controlsDisabled} className="grid gap-4">
        <legend className="mb-3 font-semibold">{t('templates.settingsHeading')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['institution', 'subject', 'room', 'course'] as const).map((field) => (
            <label key={field} htmlFor={`${id}-${field}`}>
              {t(`templates.${field}`)}
              <input
                {...fieldProps(field)}
                value={settings[field] ?? ''}
                onChange={(event) => edit(field, event.target.value)}
                maxLength={field === 'course' ? 100 : 150}
                required={field === 'course'}
              />
            </label>
          ))}
          <label htmlFor={`${id}-section`}>
            {t('templates.section')}
            <input
              {...fieldProps('section')}
              value={sectionInput}
              onChange={(event) => edit('section', event.target.value)}
              list={`${id}-sections`}
              maxLength={100}
              required
              aria-describedby={[
                `${id}-section-help`,
                error?.field === 'section' ? `${id}-error` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <datalist id={`${id}-sections`}>
              {sections.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label htmlFor={`${id}-graceMinutes`}>
            {t('templates.grace')}
            <input
              {...fieldProps('graceMinutes')}
              type="number"
              min="0"
              max="180"
              step="1"
              value={Number.isNaN(settings.graceMinutes) ? '' : settings.graceMinutes}
              onChange={(event) =>
                edit('graceMinutes', event.target.value === '' ? NaN : Number(event.target.value))
              }
              required
            />
          </label>
          <label htmlFor={`${id}-timezone`}>
            {t('templates.timezone')}
            <input
              {...fieldProps('timezone')}
              value={settings.timezone}
              onChange={(event) => edit('timezone', event.target.value)}
              placeholder="Asia/Manila"
              aria-describedby={[
                `${id}-timezone-help`,
                error?.field === 'timezone' ? `${id}-error` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          </label>
        </div>
        <p id={`${id}-section-help`} className="text-sm text-slate-600">
          {t('templates.sectionHelp')}
          {sectionMissing ? ` ${t('templates.unavailableSection', { section })}.` : ''}
        </p>
        <p id={`${id}-timezone-help`} className="text-sm text-slate-600">
          {t('templates.timezoneHelp', { timezone: deviceTimezone })}
        </p>
      </fieldset>
      <fieldset disabled={controlsDisabled || !!activeSession} className="grid gap-4">
        <legend className="mb-3 font-semibold">{t('templates.sessionHeading')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor={`${id}-roomPin`}>
            {t('templates.pin')}
            <input
              {...fieldProps('roomPin')}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setError(undefined);
              }}
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{3,6}"
              placeholder={t('templates.pinPlaceholder')}
              required
              autoComplete="off"
            />
          </label>
          <label htmlFor={`${id}-startsAt`}>
            {t('templates.start')}
            <input
              {...fieldProps('startsAt')}
              type="datetime-local"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setError(undefined);
              }}
              required
            />
          </label>
        </div>
        <p className="text-sm text-slate-600">{t('templates.freshSession')}</p>
      </fieldset>
      <PreClassReadiness
        config={{ ...settings, section, startsAt, roomPin: pin }}
        rosterCount={rosterCount}
        rosterIssues={rosterReviewIssues}
        rosterReviewPending={rosterReviewPending}
        activeSession={activeSession}
        vaultId={keys.salt}
        configurationErrors={configProblem ? [configProblem.message] : []}
        onReviewConfiguration={() =>
          focusField(activeSession ? 'course' : (configProblem?.field ?? 'course'))
        }
        onReviewRoster={() => {
          const file = document.querySelector<HTMLInputElement>(
            'input[type="file"][accept*=".csv"]',
          );
          if (file && !file.disabled) file.focus();
          else document.getElementById('class-roster')?.focus();
        }}
        onReviewActiveSession={onReviewActiveSession}
      />
      <p className="text-sm text-slate-600">
        {t('templates.review', { count: rosterCount, section: section || '—' })}
      </p>
      {activeSession ? <p className="notice">{t('templates.activeSession')}</p> : null}
      {rosterReviewPending ? <p className="notice">{t('templates.pendingRoster')}</p> : null}
      <button
        className="btn justify-self-start"
        disabled={controlsDisabled || !!activeSession || rosterReviewPending || !sections.length}
      >
        {busy ? t('templates.working') : t('templates.createSession')}
      </button>
      {error ? (
        <p id={`${id}-error`} role="alert" className="notice">
          {error.message}
        </p>
      ) : null}
      <p role="status" className="text-sm text-slate-600">
        {message}
      </p>
    </form>
  );
}
