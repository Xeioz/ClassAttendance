// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { INACTIVITY_MS, useInactivityLock } from '../src/hooks/inactivityLock';

function Harness({ active = true, lock }: { active?: boolean; lock: () => void }) {
  useInactivityLock(active, lock);
  return <button onPointerDown={() => {}}>Protected action</button>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('vault inactivity lifecycle', () => {
  it('renews on activity before expiry and locks after fifteen inactive minutes', () => {
    const lock = vi.fn();
    render(<Harness lock={lock} />);
    vi.advanceTimersByTime(INACTIVITY_MS - 1);
    fireEvent.keyDown(window, { key: 'a' });
    vi.advanceTimersByTime(INACTIVITY_MS - 1);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lock).toHaveBeenCalledOnce();
  });

  it.each(['pointerdown', 'keydown', 'focus', 'visibilitychange'])(
    'detects suspended expiry on %s without waiting for the delayed timer',
    (name) => {
      const lock = vi.fn();
      const action = vi.fn();
      render(<Harness lock={lock} />);
      window.addEventListener(name, action);
      // Wall time advances while scheduled timer callbacks remain suspended.
      vi.setSystemTime(Date.now() + INACTIVITY_MS);
      const target = name === 'visibilitychange' ? document : window;
      target.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
      expect(lock).toHaveBeenCalledOnce();
      if (name === 'pointerdown' || name === 'keydown') expect(action).not.toHaveBeenCalled();
      window.removeEventListener(name, action);
    },
  );

  it('also enforces the monotonic deadline if the wall clock moves backward', () => {
    const lock = vi.fn();
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    render(<Harness lock={lock} />);
    vi.setSystemTime(Date.now() - 60_000);
    clock.mockReturnValue(100 + INACTIVITY_MS);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(lock).toHaveBeenCalledOnce();
  });

  it('invalidates pending unlocks on pagehide even while locked and cleans up on disposal', () => {
    const lock = vi.fn();
    const { unmount } = render(<Harness lock={lock} active={false} />);
    fireEvent(window, new Event('pagehide'));
    expect(lock).toHaveBeenCalledOnce();
    unmount();
    fireEvent(window, new Event('pagehide'));
    vi.advanceTimersByTime(INACTIVITY_MS);
    expect(lock).toHaveBeenCalledOnce();
  });
});
