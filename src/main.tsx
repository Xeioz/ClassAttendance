import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Never log decrypted records. */
  }
  render() {
    return this.state.failed ? (
      <main className="card m-8">
        <h1 className="text-2xl">The page could not continue.</h1>
        <p className="my-4">
          Reload to reopen local records. Do not clear browser data; restore a backup if records are
          damaged.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Reload website
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
