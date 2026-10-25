import { useEffect, useState } from 'react';
import { isTeacherBusy } from '../domain/operations';

export function navigate(path: string) {
  if (!isTeacherBusy()) window.location.hash = path;
}
export function useRoute() {
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    let accepted = location.hash.slice(1) || '/';
    const sync = () => {
      if (isTeacherBusy()) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${accepted}`);
        return;
      }
      accepted = location.hash.slice(1) || '/';
      setPath(accepted);
      document.getElementById('main')?.focus();
    };
    const unloading = (event: BeforeUnloadEvent) => {
      if (isTeacherBusy()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('beforeunload', unloading);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('beforeunload', unloading);
    };
  }, []);
  return path;
}
