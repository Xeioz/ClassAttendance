import { useEffect } from 'react';

export const INACTIVITY_MS = 15 * 60_000;

/** Timers can be delayed by background suspension. Check expiry before accepting activity. */
export function useInactivityLock(active: boolean, lock: () => void) {
  useEffect(() => {
    // Pending unlock attempts must also be invalidated when leaving the page.
    window.addEventListener('pagehide', lock);
    if (!active) return () => window.removeEventListener('pagehide', lock);

    let lastWall = Date.now();
    let lastMonotonic = performance.now();
    let timer = window.setTimeout(lock, INACTIVITY_MS);
    const expired = () =>
      Date.now() - lastWall >= INACTIVITY_MS || performance.now() - lastMonotonic >= INACTIVITY_MS;
    const activity = (event: Event) => {
      if (expired()) {
        // Do not let the first click after expiry invoke an unlocked operation.
        event.preventDefault();
        event.stopImmediatePropagation();
        lock();
        return;
      }
      lastWall = Date.now();
      lastMonotonic = performance.now();
      clearTimeout(timer);
      timer = window.setTimeout(lock, INACTIVITY_MS);
    };
    const resume = () => {
      if (document.visibilityState === 'visible' && expired()) lock();
    };
    window.addEventListener('pointerdown', activity, true);
    window.addEventListener('keydown', activity, true);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', lock);
      window.removeEventListener('pointerdown', activity, true);
      window.removeEventListener('keydown', activity, true);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [active, lock]);
}
