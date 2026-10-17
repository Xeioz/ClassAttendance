import { useState } from 'react';
import { OfflineStatus } from './components/common/OfflineStatus';
import { StudentPass } from './components/student/StudentPass';
import { TeacherPortal } from './components/teacher/TeacherPortal';

export function App() {
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [active, setActive] = useState(false);
  if (!window.isSecureContext)
    return (
      <main className="card mx-auto my-12 max-w-xl">
        <h1 className="text-2xl">Secure connection required</h1>
        <p className="mt-4">
          Open this website over HTTPS. Camera access, encryption, and offline caching require a
          secure browser context.
        </p>
        <p className="mt-3 text-sm">
          Local development can use localhost or 127.0.0.1 on the same computer. A plain HTTP
          address on the classroom network is not sufficient.
        </p>
      </main>
    );
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <a
            href={import.meta.env.BASE_URL}
            className="flex items-center gap-3 text-lg font-semibold"
          >
            <img src={`${import.meta.env.BASE_URL}icon.svg`} width="40" height="40" alt="" />
            Attendance Desk
          </a>
          <nav aria-label="Workspace" className="flex gap-2">
            {(['student', 'teacher'] as const).map((item) => (
              <button
                key={item}
                aria-pressed={role === item}
                className={role === item ? 'btn' : 'secondary'}
                onClick={() => {
                  setRole(item);
                  setActive(false);
                }}
              >
                {item === 'student' ? 'Student pass' : 'Teacher workspace'}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <div className="mb-7">
          <p className="eyebrow">Portable QR attendance · Browser based</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">
            {role === 'student' ? 'Ready for class.' : 'Your class. Your records.'}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            {role === 'student'
              ? 'Display your pass in this browser. No installation required.'
              : 'Manage attendance locally, with a manual fallback and encrypted backups.'}
          </p>
        </div>
        <OfflineStatus active={active} />
        {role === 'student' ? <StudentPass /> : <TeacherPortal onActive={setActive} />}
      </main>
      <footer className="mx-auto max-w-6xl px-5 pb-8 text-xs text-slate-600">
        <a
          className="mb-3 inline-flex min-h-12 items-center font-semibold underline"
          href={`${import.meta.env.BASE_URL}guide.html`}
        >
          Teacher & student guide
        </a>
        <br />
        Initial loading requires internet. Offline use requires prepared browser storage. Teacher
        identity verification remains necessary.
      </footer>
    </>
  );
}
