import { useEffect, useState } from 'react';
import { OfflineStatus } from './components/common/OfflineStatus';
import { StudentPass } from './components/student/StudentPass';
import { TeacherPortal } from './components/teacher/TeacherPortal';
import { navigate, useRoute } from './hooks/route';
import { useTeacherBusy } from './domain/operations';

export function App() {
  const path = useRoute();
  const role =
    path === '/student'
      ? 'student'
      : path === '/teacher' || path.startsWith('/teacher/')
        ? 'teacher'
        : 'landing';
  const [active, setActive] = useState(false);
  const [databaseMessage, setDatabaseMessage] = useState('');
  const busy = useTeacherBusy();
  useEffect(() => {
    const changed = () =>
      setDatabaseMessage(
        'The database version changed in another tab. Finish pending work, then reload this page.',
      );
    const blocked = () =>
      setDatabaseMessage(
        'Close other Attendance Desk tabs to finish the database upgrade, then retry.',
      );
    window.addEventListener('attendance:database-changed', changed);
    window.addEventListener('attendance:database-blocked', blocked);
    return () => {
      window.removeEventListener('attendance:database-changed', changed);
      window.removeEventListener('attendance:database-blocked', blocked);
    };
  }, []);
  if (!window.isSecureContext)
    return (
      <main className="card mx-auto my-12 max-w-xl">
        <h1 className="text-2xl">Secure connection required</h1>
        <p className="mt-4">
          Open this website over HTTPS. Local development can use localhost or 127.0.0.1 on this
          computer.
        </p>
      </main>
    );
  return (
    <>
      <button
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4"
        onClick={() => document.getElementById('main')?.focus()}
      >
        Skip to content
      </button>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <button
            className="flex items-center gap-3 text-lg"
            disabled={busy}
            onClick={() => navigate('/')}
          >
            <img src={`${import.meta.env.BASE_URL}icon.svg`} width="40" height="40" alt="" />
            Attendance Desk
          </button>
          {role !== 'landing' && (
            <button className="secondary" disabled={busy} onClick={() => navigate('/')}>
              Change role
            </button>
          )}
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 sm:py-10"
      >
        {databaseMessage && (
          <p role="alert" className="notice mb-5">
            {databaseMessage}
          </p>
        )}
        <div className="mb-6">
          <p className="eyebrow">Portable QR attendance · Browser based</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">
            {role === 'student'
              ? 'Ready for class.'
              : role === 'teacher'
                ? 'Your teaching workspace.'
                : 'How are you joining today?'}
          </h1>
          <p className="mt-3 text-slate-600">
            {role === 'student'
              ? 'Your student ID. Your room challenge. Your pass.'
              : role === 'teacher'
                ? 'Classes, attendance and reports saved in this browser.'
                : 'Choose your role to get started.'}
          </p>
        </div>
        <OfflineStatus active={active || busy} student={role === 'student'} />
        {role === 'student' ? (
          <StudentPass />
        ) : role === 'teacher' ? (
          <TeacherPortal onActive={setActive} />
        ) : (
          <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
            <button
              className="card text-left hover:border-emerald-700"
              onClick={() => navigate('/student')}
            >
              <span className="eyebrow">Student</span>
              <span className="mt-4 block text-2xl font-semibold">I am a Student →</span>
              <span className="mt-3 block text-sm font-normal text-slate-600">
                Enter your ID and classroom challenge to display your QR pass.
              </span>
            </button>
            <button
              className="card text-left hover:border-emerald-700"
              onClick={() => navigate('/teacher')}
            >
              <span className="eyebrow">Teacher</span>
              <span className="mt-4 block text-2xl font-semibold">I am a Teacher →</span>
              <span className="mt-3 block text-sm font-normal text-slate-600">
                Unlock your records, choose a class and take attendance.
              </span>
            </button>
          </div>
        )}
        {busy && (
          <p role="status" className="mt-4 text-sm">
            Completing a teacher operation. Navigation is temporarily paused.
          </p>
        )}
      </main>
      <footer className="mx-auto max-w-7xl px-5 pb-8 text-xs text-slate-600">
        <a
          className="inline-flex min-h-12 items-center font-semibold underline"
          href={`${import.meta.env.BASE_URL}guide.html`}
        >
          Teacher & student guide
        </a>
        <p>
          Prepare this browser while connected before offline use. Confirm student identity before
          recording attendance.
        </p>
      </footer>
    </>
  );
}
