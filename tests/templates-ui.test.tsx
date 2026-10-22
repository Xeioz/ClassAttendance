// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { createSession, listSessions, listStudents, saveRoster } from '../src/domain/attendance';
import { listTemplates, saveTemplate } from '../src/domain/templates';
import { SessionForm } from '../src/components/teacher/SessionForm';
import type { ClassSettings, Student, VaultKeys } from '../src/types';

// Readiness has its own browser-capability tests. These tests exercise the real encrypted
// template/session persistence and the form's review, validation, and keyboard workflow.
vi.mock('../src/components/teacher/PreClassReadiness', () => ({
  PreClassReadiness: ({
    rosterCount,
    onReviewRoster,
    onReviewActiveSession,
  }: {
    rosterCount: number;
    onReviewRoster: () => void;
    onReviewActiveSession?: () => void;
  }) => (
    <aside>
      Matching roster: {rosterCount}
      <button type="button" onClick={onReviewRoster}>
        Readiness: review roster
      </button>
      <button type="button" onClick={onReviewActiveSession}>
        Readiness: review active session
      </button>
    </aside>
  ),
}));

let keys: VaultKeys;
let students: Student[];
const settings: ClassSettings = {
  institution: 'Synthetic School',
  course: 'IT 101',
  subject: 'Programming',
  section: 'A',
  room: 'Lab 7',
  graceMinutes: 12,
  timezone: 'Asia/Tokyo',
};
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  keys = await unlockVault('104928573612');
  await saveRoster(keys, [
    { id: '001', displayId: '00-1', name: 'Synthetic Student', section: 'A' },
  ]);
  students = await listStudents(keys);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function loaded() {
  await screen.findByRole('option', { name: 'No template — enter settings' });
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}
function value(label: string): string {
  return (screen.getByLabelText(label, { exact: true }) as HTMLInputElement).value;
}
function expectFieldError(label: string) {
  const control = screen.getByLabelText(label, { exact: true });
  const alert = screen.getByRole('alert');
  expect(control.getAttribute('aria-invalid')).toBe('true');
  expect(control.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
  expect(document.activeElement).toBe(control);
  return alert.textContent;
}

describe('class templates and reviewed session creation', () => {
  it('lets a fresh vault save a future-section template before a roster import and canonicalizes section suggestions', async () => {
    await db.students.clear();
    const onCreated = vi.fn(async () => {});
    render(<SessionForm keys={keys} sections={[]} students={[]} onCreated={onCreated} />);
    await loaded();
    change('Template name', 'Future class');
    change('Course', 'IT 102');
    change('Section', ' next-b ');
    fireEvent.click(screen.getByRole('button', { name: 'Save new template' }));
    await screen.findByText('Saved template “Future class”.');
    const [template] = await listTemplates(keys);
    expect(template.settings.section).toBe('NEXT-B');
    expect(value('Section')).toBe('NEXT-B');
    expect(screen.getByText(/NEXT-B — not in current roster/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Create attendance session' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(await listSessions(keys)).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    change('Section', '');
    fireEvent.click(screen.getByRole('button', { name: 'Update selected template' }));
    expectFieldError('Section');
    expect((await listTemplates(keys))[0].settings.section).toBe('NEXT-B');
  });

  it('persists a template across an offline remount and explicitly starts with current roster and fresh session values', async () => {
    const onCreated = vi.fn(async () => {});
    const first = render(
      <SessionForm keys={keys} sections={['A']} students={students} onCreated={onCreated} />,
    );
    await loaded();
    change('Template name', 'Tuesday lab');
    change('Institution (optional)', settings.institution!);
    change('Subject (optional)', settings.subject!);
    change('Room (optional)', settings.room!);
    change('Course', settings.course);
    change('Grace period in minutes', String(settings.graceMinutes));
    change('Class and report timezone', settings.timezone);
    change('Room challenge', '123456');
    change("Start time (this device's timezone)", '2001-01-01T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save new template' }));
    await screen.findByText('Saved template “Tuesday lab”.');
    const [saved] = await listTemplates(keys);
    expect(saved.settings).toEqual(settings);
    expect(Object.keys(saved.settings).sort()).toEqual(Object.keys(settings).sort());
    expect(await listSessions(keys)).toHaveLength(0);
    first.unmount();
    await saveRoster(keys, [
      { id: '002', displayId: '00-2', name: 'New Synthetic Student', section: 'A' },
    ]);
    students = await listStudents(keys);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<SessionForm keys={keys} sections={['A']} students={students} onCreated={onCreated} />);
    await loaded();
    change('Saved class template', saved.id);
    expect(value('Course')).toBe(settings.course);
    expect(value('Institution (optional)')).toBe(settings.institution);
    expect(value('Subject (optional)')).toBe(settings.subject);
    expect(value('Room (optional)')).toBe(settings.room);
    expect(value('Grace period in minutes')).toBe('12');
    expect(value('Class and report timezone')).toBe('Asia/Tokyo');
    expect(value('Room challenge')).toBe('');
    expect(value("Start time (this device's timezone)")).not.toBe('2001-01-01T09:00');
    expect(screen.getByText(/fresh snapshot.*2 students in section A/)).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    change('Room (optional)', 'Reviewed room');
    change('Room challenge', '789');
    const requestedInstant = new Date(value("Start time (this device's timezone)")).getTime();
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const [session] = await listSessions(keys);
    expect(session).toMatchObject({
      course: 'IT 101',
      room: 'Reviewed room',
      roomPin: '789',
      timezone: 'Asia/Tokyo',
      startsAt: requestedInstant,
    });
    expect(session.id).not.toBe(saved.id);
    expect(session.roster.map((student) => student.id).sort()).toEqual(['001', '002']);
    expect((await listTemplates(keys))[0].settings.room).toBe('Lab 7');
  });

  it('edits and independently duplicates templates during an active session; keyboard-confirmed removal preserves the session', async () => {
    const original = await saveTemplate(keys, { name: 'Original class', settings });
    const active = await createSession(keys, { ...settings, roomPin: '719', startsAt: Date.now() });
    const onCreated = vi.fn(async () => {});
    const user = userEvent.setup();
    render(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        activeSession={active}
        onCreated={onCreated}
      />,
    );
    await loaded();
    change('Saved class template', original.id);
    expect(
      (screen.getByRole('button', { name: 'Create attendance session' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    change('Room (optional)', 'Updated original');
    fireEvent.click(screen.getByRole('button', { name: 'Update selected template' }));
    await screen.findByText('Updated template “Original class”. Existing sessions stay unchanged.');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate saved template' }));
    await screen.findByText(/Created independent template/);
    const copyId = value('Saved class template');
    expect(copyId).not.toBe(original.id);
    change('Template name', 'Independent copy');
    change('Room (optional)', 'Copy room');
    fireEvent.click(screen.getByRole('button', { name: 'Update selected template' }));
    await screen.findByText(
      'Updated template “Independent copy”. Existing sessions stay unchanged.',
    );
    const saved = await listTemplates(keys);
    expect(saved.find((item) => item.id === original.id)?.settings.room).toBe('Updated original');
    expect(saved.find((item) => item.id === copyId)?.settings.room).toBe('Copy room');
    const remove = screen.getByRole('button', { name: 'Remove selected template' });
    remove.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep template' }));
    await user.keyboard('{Enter}');
    expect(await listTemplates(keys)).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText('Saved class template'));
    fireEvent.click(remove);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Confirm remove template' }),
    );
    await user.keyboard('{Enter}');
    await screen.findByText(
      'Removed template “Independent copy”. Existing sessions stay unchanged.',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Saved class template'));
    expect((await listTemplates(keys)).map((item) => item.id)).toEqual([original.id]);
    expect(await listSessions(keys)).toEqual([active]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('uses associated, focused field errors for keyboard session submission and template validation', async () => {
    const user = userEvent.setup();
    render(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        onCreated={vi.fn(async () => {})}
      />,
    );
    await loaded();
    screen.getByRole('button', { name: 'Create attendance session' }).focus();
    await user.keyboard('{Enter}');
    const sessionCourseError = expectFieldError('Course');
    fireEvent.click(screen.getByRole('button', { name: 'Save new template' }));
    expectFieldError('Template name');
    change('Template name', 'Validated class');
    fireEvent.click(screen.getByRole('button', { name: 'Save new template' }));
    expect(expectFieldError('Course')).toBe(sessionCourseError);
    change('Course', 'IT 101');
    change('Class and report timezone', 'Not/A_Timezone');
    fireEvent.click(screen.getByRole('button', { name: 'Save new template' }));
    const timezoneError = expectFieldError('Class and report timezone');
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    expect(expectFieldError('Class and report timezone')).toBe(timezoneError);
    change('Class and report timezone', 'UTC');
    change('Grace period in minutes', '1.5');
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    expectFieldError('Grace period in minutes');
    change('Grace period in minutes', '0');
    change("Start time (this device's timezone)", '');
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    expectFieldError("Start time (this device's timezone)");
    change("Start time (this device's timezone)", '2026-10-22T09:00');
    change('Room challenge', 'ab');
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    expectFieldError('Room challenge');
    expect(await listTemplates(keys)).toHaveLength(0);
    expect(await listSessions(keys)).toHaveLength(0);
  });

  it('keeps an unavailable template section visible and blocks a pending import without blocking template edits', async () => {
    const saved = await saveTemplate(keys, {
      name: 'Old section',
      settings: { ...settings, section: 'B' },
    });
    const onCreated = vi.fn(async () => {});
    const view = render(
      <SessionForm keys={keys} sections={['A']} students={students} onCreated={onCreated} />,
    );
    await loaded();
    change('Saved class template', saved.id);
    expect(value('Section')).toBe('B');
    expect(screen.getByText(/B — not in current roster/)).toBeTruthy();
    change('Room challenge', '429');
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    expect(expectFieldError('Section')).toMatch(/Choose an available section or import/);
    change('Section', 'A');
    view.rerender(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        rosterReviewPending
        rosterReviewIssues={1}
        onCreated={onCreated}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Create attendance session' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Start a class session' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Save or cancel the import/);
    fireEvent.click(screen.getByRole('button', { name: 'Update selected template' }));
    await screen.findByText('Updated template “Old section”. Existing sessions stay unchanged.');
    expect((await listTemplates(keys))[0].settings.section).toBe('A');
    expect(onCreated).not.toHaveBeenCalled();
    expect(await listSessions(keys)).toHaveLength(0);
  });

  it('refreshes stale reviewed roster data and requires another explicit start after a concurrent update', async () => {
    const onCreated = vi.fn(async () => {});
    const refresh = vi.fn(async () => {
      students = await listStudents(keys);
    });
    const view = render(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        onRosterChanged={refresh}
        onCreated={onCreated}
      />,
    );
    await loaded();
    change('Course', 'IT 101');
    change('Room challenge', '429');
    await saveRoster(keys, [{ id: '003', name: 'Concurrent Synthetic Student', section: 'A' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    expect(await listSessions(keys)).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    view.rerender(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        onRosterChanged={refresh}
        onCreated={onCreated}
      />,
    );
    expect(screen.getByText(/fresh snapshot.*2 students in section A/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect((await listSessions(keys))[0].roster).toHaveLength(2);
  });

  it('rejects stale template edits and removal, then explicitly reloads the newer saved settings', async () => {
    const saved = await saveTemplate(keys, { name: 'Shared template', settings });
    render(
      <SessionForm
        keys={keys}
        sections={['A']}
        students={students}
        onCreated={vi.fn(async () => {})}
      />,
    );
    await loaded();
    change('Saved class template', saved.id);
    change('Room (optional)', 'Unsaved local room');
    const newer = await saveTemplate(keys, {
      id: saved.id,
      name: saved.name,
      settings: { ...settings, room: 'Other tab room' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update selected template' }));
    await screen.findByRole('alert');
    expect((await listTemplates(keys))[0].settings.room).toBe('Other tab room');
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove template' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Keep template' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(await listTemplates(keys)).toEqual([newer]);
    fireEvent.click(screen.getByRole('button', { name: 'Keep template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved settings' }));
    await waitFor(() => expect(value('Room (optional)')).toBe('Other tab room'));
    expect(value('Room challenge')).toBe('');
    expect(await listSessions(keys)).toHaveLength(0);
  });

  it('routes readiness review to the active session and focuses the roster section when import is disabled', async () => {
    const onReviewActiveSession = vi.fn();
    render(
      <>
        <section id="class-roster" tabIndex={-1}>
          <input aria-label="Roster file" type="file" accept=".csv" disabled />
        </section>
        <SessionForm
          keys={keys}
          sections={['A']}
          students={students}
          onReviewActiveSession={onReviewActiveSession}
          onCreated={vi.fn(async () => {})}
        />
      </>,
    );
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Readiness: review roster' }));
    expect(document.activeElement).toBe(document.getElementById('class-roster'));
    fireEvent.click(screen.getByRole('button', { name: 'Readiness: review active session' }));
    expect(onReviewActiveSession).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText('Roster file') as HTMLInputElement;
    input.disabled = false;
    fireEvent.click(screen.getByRole('button', { name: 'Readiness: review roster' }));
    expect(document.activeElement).toBe(input);
  });
});
