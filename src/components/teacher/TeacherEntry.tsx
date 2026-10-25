import { Component, lazy, Suspense, type ReactNode } from 'react';
const TeacherPortal = lazy(() =>
  import('./TeacherPortal').then((module) => ({ default: module.TeacherPortal })),
);

class TeacherLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="card" role="alert">
        <h2 className="text-xl">Teacher workspace could not load</h2>
        <p className="my-4">
          Reconnect to finish preparing this website, then retry. Saved records remain in this
          browser.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Reload teacher workspace
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
export function TeacherEntry({ onActive }: { onActive: (active: boolean) => void }) {
  return (
    <TeacherLoadBoundary>
      <Suspense fallback={<p role="status">Loading teacher workspace…</p>}>
        <TeacherPortal onActive={onActive} />
      </Suspense>
    </TeacherLoadBoundary>
  );
}
