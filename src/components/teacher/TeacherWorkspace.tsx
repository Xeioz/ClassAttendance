import { useCallback, useEffect, useState } from 'react';
import { db } from '../../db/db';
import { listSessions, listStudents } from '../../domain/attendance';
import {
  associateLegacySession,
  classStudents,
  copyLegacyEnrollment,
  createClass,
  listClasses,
  updateClassDefaults,
} from '../../domain/classes';
import { useTeacherBusy } from '../../domain/operations';
import { navigate, useRoute } from '../../hooks/route';
import { errorMessage } from '../../utils/errors';
import type { ClassOffering, Session, Student, VaultKeys } from '../../types';
import { BackupControls } from './BackupControls';
import { RosterUpload } from './RosterUpload';
import { SessionForm } from './SessionForm';
import { SessionWorkspace } from './SessionWorkspace';
import { ClassForm } from './ClassForm';
import { MasterListImport } from './MasterListImport';

export function TeacherWorkspace({
  keys,
  onActive,
}: {
  keys: VaultKeys;
  onActive: (active: boolean) => void;
}) {
  const path = useRoute();
  const busy = useTeacherBusy();
  const [classes, setClasses] = useState<ClassOffering[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [members, setMembers] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all([listClasses(keys), listSessions(keys), listStudents(keys)])
      .then(([offerings, history, roster]) => {
        if (!alive) return;
        setClasses(offerings);
        setSessions(history.sort((a, b) => b.startsAt - a.startsAt));
        setStudents(roster);
        setLoaded(true);
      })
      .catch((error) => {
        if (alive) {
          setError(errorMessage(error));
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [keys, revision, path]);
  useEffect(() => {
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    const changes = () => {
      if (!busy) void refresh();
    };
    db.on('ready', changes);
    return () => {
      window.removeEventListener('focus', focus);
      db.on('ready').unsubscribe(changes);
    };
  }, [refresh, busy]);
  const active = sessions.find((session) => session.state === 'ACTIVE');
  useEffect(() => {
    onActive(Boolean(active) || busy);
    return () => onActive(false);
  }, [active, busy, onActive]);
  const parts = path.split('/').filter(Boolean);
  const classId = parts[1] === 'classes' ? parts[2] : undefined;
  const offering = classes.find((item) => item.id === classId);
  const task = parts[3] || 'overview';
  const sessionId =
    parts[1] === 'unassigned' ? parts[2] : task === 'sessions' ? parts[4] : undefined;
  const selectedSession = sessions.find((item) => item.id === sessionId);
  const contextValid =
    selectedSession &&
    (parts[1] === 'unassigned' ? !selectedSession.classId : selectedSession.classId === classId);
  useEffect(() => {
    let alive = true;
    setMembers([]);
    if (classId)
      void classStudents(keys, classId)
        .then((value) => {
          if (alive) setMembers(value);
        })
        .catch((error) => {
          if (alive) setError(errorMessage(error));
        });
    return () => {
      alive = false;
    };
  }, [keys, classId, revision, path]);
  const classPath = (id: string, suffix = 'overview') => `/teacher/classes/${id}/${suffix}`;
  const sessionPath = (session: Session) =>
    session.classId
      ? classPath(session.classId, `sessions/${session.id}`)
      : `/teacher/unassigned/${session.id}`;
  const root = path === '/teacher' || path === '/teacher/';
  const unassigned = sessions.filter((item) => !item.classId);
  const classHistory = sessions.filter((item) => item.classId === classId);
  async function action(task: () => Promise<unknown>) {
    setError('');
    try {
      await task();
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  if (!loaded) return <p role="status">Loading your classes and records…</p>;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      {workspaceNotice && root && (
        <p
          role="status"
          className="rounded-xl border border-emerald-700 bg-emerald-50 p-4 lg:col-span-2"
        >
          {workspaceNotice}
        </p>
      )}
      <aside
        aria-label="Classes and sessions"
        className={`card min-w-0 ${root ? '' : 'hidden lg:block'}`}
      >
        {active && (
          <button
            className="btn mb-4 w-full lg:hidden"
            disabled={busy}
            onClick={() => navigate(sessionPath(active))}
          >
            Resume {active.course} attendance
          </button>
        )}
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="text-xl">Your classes</h2>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold">
            {classes.length}
          </span>
        </div>
        <button
          className="btn mb-4 w-full"
          disabled={busy}
          onClick={() => navigate('/teacher/import')}
        >
          Import master list
        </button>
        <button
          className="secondary mb-4 w-full"
          disabled={busy}
          onClick={() => navigate('/teacher/new')}
        >
          + Add class manually
        </button>
        <label>
          Find a class
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Course, section or term"
          />
        </label>
        <nav aria-label="Class list" className="mt-4 grid gap-2">
          {classes
            .filter((item) =>
              `${item.course} ${item.section} ${item.term}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((item) => (
              <button
                key={item.id}
                aria-current={classId === item.id ? 'page' : undefined}
                className={`rounded-xl border p-3 text-left ${classId === item.id ? 'border-forest bg-emerald-50' : 'border-slate-200'}`}
                disabled={busy}
                onClick={() => navigate(classPath(item.id))}
              >
                <span className="block font-semibold">
                  {item.course} / {item.section}
                </span>
                <span className="mt-1 block text-xs font-normal text-slate-600">
                  {item.term}
                  {active?.classId === item.id ? ' · ● Active session' : ''}
                </span>
              </button>
            ))}
        </nav>
        {!classes.length && (
          <p className="mt-4 text-sm text-slate-600">
            Import a master list to detect classes and complete any missing details.
          </p>
        )}
        <div className="mt-6 grid gap-2 border-t pt-4">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => navigate('/teacher/unassigned')}
          >
            Unassigned records ({unassigned.length})
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => navigate('/teacher/settings')}
          >
            Backup & storage
          </button>
        </div>
      </aside>
      <div className={`min-w-0 ${root && classes.length > 0 ? 'hidden lg:block' : ''}`}>
        {!root && (
          <button
            className="secondary mb-4 lg:hidden"
            disabled={busy}
            onClick={() => navigate('/teacher')}
          >
            ← Back to classes
          </button>
        )}
        {active && active.id !== sessionId && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-700 bg-emerald-50 p-4">
            <p>
              <strong>Attendance in progress</strong>
              <span className="mt-1 block text-sm">
                {active.course} / {active.section}
              </span>
            </p>
            <button className="btn" disabled={busy} onClick={() => navigate(sessionPath(active))}>
              Resume attendance
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="notice mb-5">
            {error}
          </p>
        )}
        {(root && !classes.length) || parts[1] === 'import' ? (
          <MasterListImport
            keys={keys}
            disabled={Boolean(active) || busy}
            onSaved={async () => {
              setWorkspaceNotice(
                'Master list saved. Choose a class to review enrollment or start attendance.',
              );
              await refresh();
              navigate('/teacher');
            }}
          />
        ) : root ? (
          <section className="card">
            <p className="eyebrow">Daily attendance</p>
            <h2 className="mt-3 text-2xl">Your classes are ready.</h2>
            <p className="mt-3 text-slate-600">
              Each class keeps its own enrollment and session history. Import another master list to
              add students or classes, or choose an existing class to take attendance.
            </p>
          </section>
        ) : parts[1] === 'new' ? (
          <ClassForm
            onSave={async (input) => {
              const created = await createClass(keys, input);
              await refresh();
              navigate(classPath(created.id, 'roster'));
            }}
          />
        ) : parts[1] === 'settings' ? (
          <BackupControls keys={keys} />
        ) : parts[1] === 'unassigned' && !sessionId ? (
          <section className="card">
            <p className="eyebrow">Legacy review</p>
            <h2 className="mt-2 text-2xl">Unassigned records</h2>
            <p className="my-4 text-sm text-slate-600">
              Your original records remain intact. Create matching classes, then associate sessions
              below. Terms cannot be inferred from old records. Legacy section rosters can be
              explicitly copied from a class's Roster screen.
            </p>
            <SessionList
              sessions={unassigned}
              open={(session) => navigate(sessionPath(session))}
              disabled={busy}
            />
            {!unassigned.length && <p>No sessions need association.</p>}
          </section>
        ) : sessionId ? (
          contextValid ? (
            <>
              <button
                className="secondary mb-4"
                disabled={busy}
                onClick={() =>
                  navigate(offering ? classPath(offering.id, 'history') : '/teacher/unassigned')
                }
              >
                ← Session history
              </button>
              {!selectedSession.classId && (
                <section className="card mb-5">
                  <h2 className="text-lg">Associate this legacy session</h2>
                  <p className="my-3 text-sm">
                    This changes navigation only. Attendance, IDs and historical roster snapshots
                    are preserved.
                  </p>
                  <label>
                    Matching class
                    <select
                      defaultValue=""
                      disabled={busy}
                      onChange={(event) => {
                        const id = event.target.value;
                        if (id)
                          void action(async () => {
                            await associateLegacySession(keys, selectedSession.id, id);
                            navigate(classPath(id, `sessions/${selectedSession.id}`));
                          });
                      }}
                    >
                      <option value="">Select course / section / term</option>
                      {classes
                        .filter(
                          (item) =>
                            item.course === selectedSession.course &&
                            item.section === selectedSession.section,
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.course} / {item.section} / {item.term}
                          </option>
                        ))}
                    </select>
                  </label>
                </section>
              )}
              <SessionWorkspace
                key={selectedSession.id}
                keys={keys}
                sessionId={selectedSession.id}
                onActive={onActive}
                onLifecycleChanged={refresh}
              />
            </>
          ) : (
            <p role="alert" className="notice">
              This session does not belong to the requested class, or no longer exists. Return to
              classes.
            </p>
          )
        ) : offering ? (
          <>
            <section className="card mb-5">
              <p className="eyebrow">{offering.term}</p>
              <h2 className="mt-2 text-2xl">
                {offering.course} / {offering.section}
              </h2>
              <p className="mt-2 text-slate-600">
                {offering.subject || 'Class workspace'} · {members.length} enrolled
              </p>
              <nav aria-label="Class tasks" className="mt-5 flex flex-wrap gap-2">
                {['overview', 'roster', 'history', 'defaults', 'start'].map((item) => (
                  <button
                    key={item}
                    aria-current={task === item ? 'page' : undefined}
                    className={task === item ? 'btn' : 'secondary'}
                    disabled={busy || (item === 'start' && Boolean(active))}
                    onClick={() => navigate(classPath(offering.id, item))}
                  >
                    {item === 'start' ? 'Start attendance' : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </nav>
            </section>
            {task === 'defaults' ? (
              <ClassForm
                key={offering.id}
                initial={offering}
                onSave={async (input) => {
                  await updateClassDefaults(keys, offering.id, input);
                  await refresh();
                  navigate(classPath(offering.id));
                }}
              />
            ) : task === 'start' ? (
              active ? (
                <p className="notice">
                  Resume or close the active session before starting another.
                </p>
              ) : (
                <SessionForm
                  key={offering.id}
                  keys={keys}
                  offering={offering}
                  sections={[offering.section]}
                  onCreated={async (session) => {
                    await refresh();
                    navigate(sessionPath(session));
                  }}
                />
              )
            ) : task === 'history' ? (
              <section className="card">
                <h3 className="mb-4 text-xl">Session history</h3>
                <SessionList
                  sessions={classHistory}
                  open={(session) => navigate(sessionPath(session))}
                  disabled={busy}
                />
                {!classHistory.length && <p>No sessions yet.</p>}
              </section>
            ) : task === 'roster' ? (
              <div className="grid gap-5">
                <RosterUpload
                  key={offering.id}
                  keys={keys}
                  classId={offering.id}
                  disabled={Boolean(active) || busy}
                  onSaved={refresh}
                />
                {students.some((item) => item.section === offering.section) && (
                  <section className="card">
                    <h3 className="text-lg">Review existing section roster</h3>
                    <p className="my-3 text-sm">
                      {students.filter((item) => item.section === offering.section).length} existing
                      identities match {offering.section}. Copying adds them to this class without
                      removing other enrollment or altering history. Review the names below before
                      copying.
                    </p>
                    <ul className="mb-4 max-h-48 overflow-auto text-sm">
                      {students
                        .filter((item) => item.section === offering.section)
                        .map((item) => (
                          <li className="py-1" key={item.token}>
                            {item.displayId ?? item.id} · {item.name}
                          </li>
                        ))}
                    </ul>
                    <button
                      className="secondary"
                      disabled={Boolean(active) || busy}
                      onClick={() => void action(() => copyLegacyEnrollment(keys, offering.id))}
                    >
                      Add existing section students to this class
                    </button>
                  </section>
                )}
                <section className="card">
                  <h3 className="mb-4 text-lg">Enrolled students ({members.length})</h3>
                  <ul className="divide-y">
                    {members.map((student) => (
                      <li key={student.token} className="py-3">
                        <span className="font-semibold">{student.name}</span>
                        <span className="ml-3 font-mono text-sm">
                          {student.displayId ?? student.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!members.length && (
                    <p>Import a CSV or review the existing section roster above.</p>
                  )}
                </section>
              </div>
            ) : task === 'overview' ? (
              <section className="card">
                <h3 className="text-xl">Ready for your next class?</h3>
                <p className="my-4 text-slate-600">
                  {members.length
                    ? `${members.length} students enrolled. Review the start time and ${offering.graceMinutes}-minute default grace period before scanning.`
                    : 'Import your students first. Enrollment belongs to this course and term.'}
                </p>
                <button
                  className="btn"
                  disabled={busy || Boolean(active)}
                  onClick={() =>
                    navigate(classPath(offering.id, members.length ? 'start' : 'roster'))
                  }
                >
                  {members.length ? 'Start attendance →' : 'Import student roster →'}
                </button>
                <p className="mt-5 text-sm">
                  {classHistory.length} saved sessions · Records stay in this browser.
                </p>
              </section>
            ) : (
              <p role="alert" className="notice">
                Unknown class task. Choose Overview.
              </p>
            )}
          </>
        ) : (
          <p role="alert" className="notice">
            Class not found. Return to classes or restore a verified backup.
          </p>
        )}
      </div>
    </div>
  );
}

function SessionList({
  sessions,
  open,
  disabled,
}: {
  sessions: Session[];
  open: (session: Session) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3">
      {sessions.map((session) => (
        <button
          key={session.id}
          className="secondary justify-between gap-4 text-left"
          disabled={disabled}
          onClick={() => open(session)}
        >
          <span>
            {session.course} / {session.section}
            <span className="mt-1 block text-xs font-normal">
              {new Date(session.startsAt).toLocaleString()}
            </span>
          </span>
          <span className="text-xs">{session.state === 'ACTIVE' ? '● Resume' : 'Closed →'}</span>
        </button>
      ))}
    </div>
  );
}
