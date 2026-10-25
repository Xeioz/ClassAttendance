import { Component, lazy, Suspense, type ReactNode } from 'react';
import { t } from '../../i18n';

const Teacher = lazy(() =>
  import('./TeacherPortal').then((module) => ({ default: module.TeacherPortal })),
);

class TeacherLoadBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card mx-auto max-w-xl" role="alert">
        <p>{t('portal.loadFailed')}</p>
        <button type="button" className="secondary mt-4" onClick={this.props.onRetry}>
          {t('portal.retry')}
        </button>
      </section>
    );
  }
}

export function TeacherEntry({ onActive }: { onActive: (active: boolean) => void }) {
  return (
    <TeacherLoadBoundary
      onRetry={() => {
        // Failed ES-module imports may be cached by the browser. Reloading at
        // #teacher also recovers from a missing chunk after a website update.
        window.location.reload();
      }}
    >
      <Suspense fallback={<p role="status">{t('portal.loadingWorkspace')}</p>}>
        <Teacher onActive={onActive} />
      </Suspense>
    </TeacherLoadBoundary>
  );
}
