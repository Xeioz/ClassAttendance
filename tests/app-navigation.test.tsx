// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';

vi.mock('../src/components/common/OfflineStatus', () => ({ OfflineStatus: () => null }));
vi.mock('../src/components/teacher/TeacherPortal', () => ({
  TeacherPortal: () => {
    const [unlocked, setUnlocked] = useState(false);
    return unlocked ? (
      <p>Synthetic unlocked view</p>
    ) : (
      <button onClick={() => setUnlocked(true)}>Synthetic unlock gate</button>
    );
  },
}));
beforeEach(() => {
  vi.stubGlobal('isSecureContext', true);
  window.history.replaceState(null, '', '/');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('role-specific navigation', () => {
  it('supports a direct teacher URL and disposes teacher state when switching roles', async () => {
    window.history.replaceState(null, '', '/#teacher');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Synthetic unlock gate' }));
    expect(screen.getByText('Synthetic unlocked view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Student pass' }));
    expect(screen.getByLabelText('Student ID')).toBeTruthy();
    expect(screen.queryByText('Synthetic unlocked view')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Teacher workspace' }));
    await screen.findByRole('button', { name: 'Synthetic unlock gate' });
    expect(window.location.hash).toBe('#teacher');
  });

  it('responds to browser fragment navigation and requires a secure context', async () => {
    const view = render(<App />);
    window.history.replaceState(null, '', '/#teacher');
    fireEvent(window, new Event('hashchange'));
    await screen.findByRole('button', { name: 'Synthetic unlock gate' });
    vi.stubGlobal('isSecureContext', false);
    view.rerender(<App />);
    expect(screen.getByRole('heading', { name: 'Secure connection required' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Synthetic unlock gate' })).toBeNull();
  });
});
