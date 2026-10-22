// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createTranslator, resources, supportedLocales, t } from '../src/i18n';
import { AccessibleHUD } from '../src/components/common/AccessibleHUD';
import { ManualEntryDialog } from '../src/components/teacher/ManualEntryDialog';
import { TeacherPortal } from '../src/components/teacher/TeacherPortal';
import { TeacherWorkspace } from '../src/components/teacher/TeacherWorkspace';
import { StudentPass } from '../src/components/student/StudentPass';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { closeSession, createSession, getAttendance, saveRoster } from '../src/domain/attendance';
import type { Session, VaultKeys } from '../src/types';

const defaultExcusedLabel = resources.en['status.EXCUSED'];
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterEach(() => {
  cleanup();
  resources.en['status.EXCUSED'] = defaultExcusedLabel;
  vi.unstubAllGlobals();
});

async function classroom() {
  const keys = await unlockVault('104928573612');
  await saveRoster(keys, [
    { id: '001', displayId: '00-1', name: 'Synthetic Student', section: 'A' },
  ]);
  const session = await createSession(keys, {
    course: 'IT301',
    section: 'A',
    roomPin: '492',
    startsAt: Date.now(),
    graceMinutes: 15,
  });
  return { keys, session };
}
function ManualHarness({ keys, session }: { keys: VaultKeys; session: Session }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <h1>Attendance test</h1>
      <button onClick={() => setOpen(true)}>Open manual attendance</button>
      {open ? (
        <ManualEntryDialog
          keys={keys}
          session={session}
          attendance={new Map()}
          onClose={() => setOpen(false)}
          onSaved={async () => {}}
        />
      ) : null}
    </main>
  );
}
async function checkSemantics() {
  // jsdom cannot measure contrast; real-browser checks cover rendered geometry and contrast.
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(
    result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}

describe('offline localization fallback', () => {
  it('falls back for unsupported locales and missing strings while preserving explicit diagnostics', () => {
    const translate = createTranslator(
      {
        en: { welcome: 'Hello {name}', count: '{count} students', fallback: 'English fallback' },
        test: { welcome: 'Synthetic translated greeting for {name}' },
      },
      'test-REGION',
    );
    expect(translate('welcome', { name: 'José' })).toBe('Synthetic translated greeting for José');
    expect(translate('fallback')).toBe('English fallback');
    expect(translate('count', { count: 0 })).toBe('0 students');
    expect(translate('welcome')).toBe('Synthetic translated greeting for {name}');
    expect(translate('unlisted')).toBe('[unlisted]');
    expect(createTranslator(resources, 'not-a-supported-locale')('manual.title')).toBe(
      'Manual attendance',
    );
    expect(translate('toString')).toBe('[toString]');
    expect(supportedLocales).toEqual(['en']);
  });

  it('keeps long display translations and canonical attendance values separate during a real save', async () => {
    const { keys, session } = await classroom();
    resources.en['status.EXCUSED'] =
      'Synthetic long translated display label for an excused attendance entry';
    render(<ManualHarness keys={keys} session={session} />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText('Search students'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Enrolled student'));
    await user.selectOptions(screen.getByLabelText('Enrolled student'), session.roster[0].token);
    await user.tab(); // Correction checkbox.
    await user.tab(); // Status selector.
    expect(document.activeElement).toBe(screen.getByLabelText('Status', { exact: true }));
    await user.selectOptions(screen.getByLabelText('Status', { exact: true }), 'EXCUSED');
    expect(
      screen.getByRole('option', { name: /Synthetic long translated/ }).getAttribute('value'),
    ).toBe('EXCUSED');
    await user.tab();
    await user.keyboard('Official school activity');
    await user.tab();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open manual attendance' }),
    );
    expect((await getAttendance(keys, session.id)).get(session.roster[0].token)).toMatchObject({
      status: 'EXCUSED',
      reason: 'Official school activity',
      source: 'MANUAL',
    });
    expect(session.roster[0].id).toBe('001');
    expect(session.roster[0].displayId).toBe('00-1');
  });
});

describe('accessible feedback and validation', () => {
  it('reviews and focuses the active session when history currently shows a closed session', async () => {
    const { keys, session: historical } = await classroom();
    await closeSession(keys, historical);
    const active = await createSession(keys, {
      course: 'Active classroom',
      section: 'A',
      roomPin: '492',
      startsAt: Date.now(),
      graceMinutes: 15,
    });
    render(<TeacherWorkspace keys={keys} onActive={() => {}} />);
    await screen.findByRole('heading', { name: 'Active classroom / A' });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Session history'), historical.id);
    await screen.findByRole('heading', { name: 'IT301 / A' });
    await user.click(screen.getByText(t('workspace.preparation')));
    await user.click(await screen.findByRole('button', { name: 'Review active session' }));
    await screen.findByRole('heading', { name: 'Active classroom / A' });
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('active-session')),
    );
    expect((screen.getByLabelText('Session history') as HTMLSelectElement).value).toBe(active.id);
    expect(screen.getByRole('button', { name: 'Manual check-in / correction (F2)' })).toBeTruthy();
  });

  it('announces processing without repeating a previous saved result, then exposes each result as text', () => {
    const view = render(
      <AccessibleHUD result={{ kind: 'valid', title: 'Attendance saved', detail: 'Student A' }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Attendance saved');
    view.rerender(
      <AccessibleHUD
        processing
        result={{ kind: 'valid', title: 'Attendance saved', detail: 'Student A' }}
      />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('Processing attendance');
    expect(screen.getByRole('status').textContent).not.toContain('Attendance saved');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    for (const [kind, title] of [
      ['duplicate', 'Already recorded'],
      ['unknown', 'Student not recognized'],
      ['error', 'Save failed'],
    ] as const) {
      view.rerender(<AccessibleHUD result={{ kind, title, detail: 'Review this result' }} />);
      expect(screen.getByRole('status').textContent).toContain(title);
    }
  });

  it('associates invalid manual fields, focuses them, and cancels without writing attendance', async () => {
    const { keys, session } = await classroom();
    render(<ManualHarness keys={keys} session={session} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open manual attendance' }));
    await user.click(screen.getByRole('button', { name: 'Save attendance' }));
    const student = screen.getByLabelText('Enrolled student');
    expect(student.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(student.getAttribute('aria-describedby')!)?.textContent).toBe(
      t('manual.selectRequired'),
    );
    expect(document.activeElement).toBe(student);
    await user.selectOptions(student, session.roster[0].token);
    fireEvent.change(screen.getByLabelText('Required reason'), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Save attendance' }));
    const reason = screen.getByLabelText('Required reason');
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(reason);
    expect(reason.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    await checkSemantics();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open manual attendance' }),
    );
    expect((await getAttendance(keys, session.id)).size).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Open manual attendance' }));
    expect((screen.getByLabelText('Required reason') as HTMLTextAreaElement).value).toBe('');
  });

  it('focuses and describes invalid student fields with a keyboard submission', async () => {
    render(
      <main>
        <h1>Student attendance</h1>
        <StudentPass />
      </main>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Student ID'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Student ID').getAttribute('aria-invalid')).toBe('true');
    await user.keyboard('00-1');
    await user.tab();
    await user.keyboard('12{Enter}');
    const challenge = screen.getByLabelText('Room challenge');
    expect(document.activeElement).toBe(challenge);
    expect(challenge.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(challenge.getAttribute('aria-describedby')!)?.textContent).toBe(
      t('student.challengeHint'),
    );
    await checkSemantics();
  });

  it('focuses PIN confirmation after mismatch without creating a vault', async () => {
    render(
      <main>
        <h1>Teacher attendance</h1>
        <TeacherPortal onActive={() => {}} />
      </main>,
    );
    await screen.findByRole('button', { name: 'Create encrypted workspace' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Master PIN (6–12 digits)'), '123456');
    await user.type(screen.getByLabelText('Confirm new PIN'), '654321');
    await user.click(screen.getByRole('button', { name: 'Create encrypted workspace' }));
    await screen.findByText(t('portal.pinMismatch'));
    const confirmation = screen.getByLabelText('Confirm new PIN');
    await waitFor(() => expect(document.activeElement).toBe(confirmation));
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(confirmation.getAttribute('aria-describedby')!)?.textContent,
    ).toBe(t('portal.pinMismatch'));
    expect(await db.meta.get('vault')).toBeUndefined();
  });
});
