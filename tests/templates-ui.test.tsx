// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import { listTemplates, saveTemplate } from '../src/domain/templates';
import { createClass, listClasses, classStudents } from '../src/domain/classes';
import { saveRoster, createSession, listStudents } from '../src/domain/attendance';
import { LegacyTemplates } from '../src/components/teacher/LegacyTemplates';
import { ClassForm } from '../src/components/teacher/ClassForm';
import { SessionForm } from '../src/components/teacher/SessionForm';
import type { VaultKeys, Session } from '../src/types';

// Template CRUD/concurrency and authenticated recovery remain covered by templates-data.test.ts.
// These assertions follow the integrated class-based UI instead of the retired template tab.
vi.mock('../src/components/teacher/SessionReadiness', () => ({
  SessionReadiness: () => <p>Session device checks</p>,
}));
let keys: VaultKeys;
const settings = {
  course: 'IT101',
  section: 'A',
  subject: 'Programming',
  room: 'Lab 7',
  institution: 'Synthetic School',
  graceMinutes: 12,
  timezone: 'Asia/Tokyo',
};
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  history.replaceState(null, '', '/#/teacher/settings');
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
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}
async function choose(name = 'Tuesday class') {
  const template = await saveTemplate(keys, { name, settings });
  render(<LegacyTemplates keys={keys} />);
  await screen.findByRole('option', { name });
  fireEvent.change(screen.getByLabelText('Template to review'), { target: { value: template.id } });
  return template;
}
async function copy(term = '2026 / 1') {
  change('Term', term);
  fireEvent.click(screen.getByRole('button', { name: 'Create class and add students' }));
  await waitFor(async () => expect(await db.classes.count()).toBe(1));
}

describe('legacy templates in the class-based workspace', () => {
  it('retains saved defaults after an offline remount without creating enrollment', async () => {
    await choose();
    expect((screen.getByLabelText('Course code') as HTMLInputElement).value).toBe('IT101');
    expect((screen.getByLabelText('Default report timezone') as HTMLInputElement).value).toBe(
      'Asia/Tokyo',
    );
    cleanup();
    render(<LegacyTemplates keys={keys} />);
    await screen.findByRole('option', { name: 'Tuesday class' });
    expect(await db.classes.count()).toBe(0);
    expect(await db.enrollments.count()).toBe(0);
  });
  it('requires an explicit term and copies settings without assigning a historical roster', async () => {
    const original = await choose();
    expect((screen.getByLabelText('Term') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Term') as HTMLInputElement).required).toBe(true);
    await copy();
    const offering = (await listClasses(keys))[0];
    expect(offering).toMatchObject({ ...settings, term: '2026 / 1' });
    expect(await classStudents(keys, offering.id)).toEqual([]);
    expect(await listTemplates(keys)).toEqual([original]);
  });
  it('allows correction of copied course and section before creating the offering', async () => {
    await choose();
    change('Course code', 'IT102');
    change('Section', 'B');
    await copy();
    expect((await listClasses(keys))[0]).toMatchObject({ course: 'IT102', section: 'B' });
    expect((await listTemplates(keys))[0].settings).toMatchObject({
      course: 'IT101',
      section: 'A',
    });
  });
  it('keeps future-section templates available without inventing students', async () => {
    await choose();
    change('Section', 'FUTURE');
    await copy('2027 / 1');
    expect((await listClasses(keys))[0].section).toBe('FUTURE');
    expect(await listStudents(keys)).toEqual([]);
  });
  it('rejects a duplicate class identity and leaves the existing class and template intact', async () => {
    const offering = await createClass(keys, { ...settings, term: '2026 / 1' });
    await choose();
    change('Term', '2026 / 1');
    fireEvent.click(screen.getByRole('button', { name: 'Create class and add students' }));
    await screen.findByRole('alert');
    expect((await listClasses(keys)).map((item) => item.id)).toEqual([offering.id]);
    expect(await db.classTemplates.count()).toBe(1);
  });
  it('updates future defaults without rewriting a historical session', async () => {
    const offering = await createClass(keys, { ...settings, term: '2026 / 1' });
    await saveRoster(keys, [{ id: '001', name: 'Synthetic Student', section: 'A' }], offering.id);
    await createSession(keys, {
      ...settings,
      classId: offering.id,
      roomPin: '492',
      startsAt: Date.now(),
    });
    const before = await db.sessions.toArray();
    const { updateClassDefaults } = await import('../src/domain/classes');
    render(
      <ClassForm
        initial={offering}
        onSave={(data) => updateClassDefaults(keys, offering.id, data)}
      />,
    );
    change('Room (optional)', 'Lab 8');
    fireEvent.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(async () => expect((await listClasses(keys))[0].room).toBe('Lab 8'));
    expect(await db.sessions.toArray()).toEqual(before);
  });
  it('rejects a stale roster at session start and requires a fresh review', async () => {
    const offering = await createClass(keys, { ...settings, term: '2026 / 1' });
    await saveRoster(keys, [{ id: '001', name: 'First', section: 'A' }], offering.id);
    const shown = await classStudents(keys, offering.id);
    await saveRoster(keys, [{ id: '002', name: 'Second', section: 'A' }], offering.id);
    const created = vi.fn(async (_session: Session) => {});
    render(
      <SessionForm
        keys={keys}
        offering={offering}
        roster={shown}
        sections={['A']}
        onCreated={created}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await screen.findByRole('alert');
    expect(created).not.toHaveBeenCalled();
    expect(await db.sessions.count()).toBe(0);
    cleanup();
    render(
      <SessionForm
        keys={keys}
        offering={offering}
        roster={await classStudents(keys, offering.id)}
        sections={['A']}
        onCreated={created}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(await db.sessions.count()).toBe(1);
  });
  it('starts a class-specific session with a fresh challenge and the current enrolled roster', async () => {
    const offering = await createClass(keys, { ...settings, term: '2026 / 1' });
    await saveRoster(
      keys,
      [{ id: '001', displayId: '00-1', name: 'Student', section: 'A' }],
      offering.id,
    );
    const created = vi.fn(async (_session: Session) => {});
    render(
      <SessionForm
        keys={keys}
        offering={offering}
        roster={await classStudents(keys, offering.id)}
        sections={['A']}
        onCreated={created}
      />,
    );
    expect((screen.getByLabelText('Room challenge') as HTMLInputElement).value).toMatch(/^\d{6}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Create attendance session' }));
    await waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(created.mock.calls[0][0]).toMatchObject({
      classId: offering.id,
      roster: [{ id: '001', displayId: '00-1' }],
    });
  });
});
