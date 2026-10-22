import { useState } from 'react';
import { OfflineStatus } from './components/common/OfflineStatus';
import { StudentPass } from './components/student/StudentPass';
import { TeacherPortal } from './components/teacher/TeacherPortal';
import { t } from './i18n';

export function App() {
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [active, setActive] = useState(false);
  if (!window.isSecureContext)
    return (
      <main className="card mx-auto my-12 max-w-xl">
        <h1 className="text-2xl">{t('app.secureTitle')}</h1>
        <p className="mt-4">{t('app.secureDescription')}</p>
        <p className="mt-3 text-sm">{t('app.secureLocal')}</p>
      </main>
    );
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4"
      >
        {t('app.skip')}
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <a
            href={import.meta.env.BASE_URL}
            className="flex items-center gap-3 text-lg font-semibold"
          >
            <img src={`${import.meta.env.BASE_URL}icon.svg`} width="40" height="40" alt="" />
            {t('app.title')}
          </a>
          <nav aria-label={t('app.navigation')} className="flex flex-wrap gap-2">
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
                {item === 'student' ? t('app.studentTab') : t('app.teacherTab')}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <div className="mb-7">
          <p className="eyebrow">{t('app.eyebrow')}</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">
            {role === 'student' ? t('app.studentTitle') : t('app.teacherTitle')}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            {role === 'student' ? t('app.studentDescription') : t('app.teacherDescription')}
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
          {t('app.guide')}
        </a>
        <br />
        {t('app.footer')}
      </footer>
    </>
  );
}
