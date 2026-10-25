import { useEffect, useState } from 'react';
import { isTeacherBusy } from '../domain/operations';

export function navigate(path: string) {
  if (!isTeacherBusy()) window.location.hash = path;
}
function currentPath() {
  const raw = location.hash.slice(1) || '/';
  return raw === 'student' || raw === 'teacher' ? `/${raw}` : raw;
}
export function useRoute() {
  const [path, setPath] = useState(() => currentPath());
  useEffect(() => {
    let accepted = currentPath();
    const sync = () => {
      if (isTeacherBusy()) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${accepted}`);
        return;
      }
      accepted = currentPath();
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
