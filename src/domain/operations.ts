import { useSyncExternalStore } from 'react';

let pending = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export function isTeacherBusy() {
  return pending > 0;
}
export function useTeacherBusy() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, isTeacherBusy);
}
// Serialize complete operations across cooperating tabs, including pre-transaction crypto.
// IndexedDB transactions remain the integrity boundary where Web Locks is unavailable.
export function teacherOperation<A extends unknown[], R>(task: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    pending++;
    notify();
    try {
      if (typeof navigator !== 'undefined' && navigator.locks)
        return await navigator.locks.request('attendance-desk:mutation:v2', () => task(...args));
      return await task(...args);
    } finally {
      pending--;
      notify();
    }
  };
}
