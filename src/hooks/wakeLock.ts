import { useEffect, useState } from 'react';

export function useWakeLock(active: boolean): string {
  const [status, setStatus] = useState('Screen wake lock is optional.');
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    let requesting = false;
    async function acquire() {
      if (
        disposed ||
        requesting ||
        (lock && !lock.released) ||
        document.visibilityState !== 'visible'
      )
        return;
      if (!navigator.wakeLock) {
        setStatus('Keep your screen awake manually.');
        return;
      }
      requesting = true;
      try {
        const result = await navigator.wakeLock.request('screen');
        if (disposed) {
          await result.release();
          return;
        }
        lock = result;
        setStatus('Screen wake lock active. Adjust brightness if needed.');
        result.addEventListener('release', () => {
          if (!disposed) setStatus('Wake lock released. Keep your screen awake manually.');
        });
      } catch {
        if (!disposed) setStatus('Wake lock unavailable. Keep your screen awake manually.');
      } finally {
        requesting = false;
      }
    }
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
  return status;
}
