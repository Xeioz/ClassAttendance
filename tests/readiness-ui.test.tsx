// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreClassReadiness } from '../src/components/teacher/PreClassReadiness';
import { recordBackupRequested, recordRestoreCompleted } from '../src/domain/readiness';
import type { Session } from '../src/types';

const config = {
  course: 'MATH101',
  section: 'A',
  room: '102',
  startsAt: 1_800_000_000_000,
  graceMinutes: 10,
  roomPin: '492',
  timezone: 'UTC',
};
const activeSession: Session = { id: 'active', state: 'ACTIVE', roster: [], ...config };
function card(name: string) {
  return screen.getByRole('heading', { name, level: 4 }).closest('li')!;
}
function browser(permission: PermissionState = 'prompt') {
  const status = new EventTarget() as PermissionStatus;
  Object.defineProperty(status, 'state', { value: permission, writable: true });
  const getUserMedia = vi.fn();
  const persisted = vi.fn().mockResolvedValue(true);
  const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 1024 * 1024 });
  const persist = vi.fn();
  vi.stubGlobal('navigator', {
    permissions: { query: vi.fn().mockResolvedValue(status) },
    mediaDevices: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
    storage: { persisted, estimate, persist },
  });
  return { status, getUserMedia, persisted, estimate, persist };
}
function videoStream(live = true) {
  const stop = vi.fn();
  const audioStop = vi.fn();
  const video = { stop, readyState: live ? 'live' : 'ended' };
  const stream = {
    getVideoTracks: () => [video],
    getTracks: () => [video, { stop: audioStop }],
  } as unknown as MediaStream;
  return { stream, stop, audioStop };
}

beforeEach(() => {
  browser();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('pre-class readiness workflow', () => {
  it('updates class, roster preview, and active-session blockers independently from device advice', async () => {
    const { rerender } = render(
      <PreClassReadiness config={{ ...config, course: '' }} rosterCount={0} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh safe checks' })).toBeDefined(),
    );
    expect(within(card('Class configuration')).getByText('Needs attention')).toBeDefined();
    expect(within(card('Matching roster')).getByText('Needs attention')).toBeDefined();
    rerender(
      <PreClassReadiness
        config={config}
        rosterCount={2}
        rosterReviewPending
        activeSession={activeSession}
      />,
    );
    expect(within(card('Class configuration')).getByText('Ready')).toBeDefined();
    expect(
      screen.getByText('Save or cancel the roster preview before starting a session.'),
    ).toBeDefined();
    expect(within(card('Active session')).getByText('Needs attention')).toBeDefined();
    rerender(<PreClassReadiness config={config} rosterCount={2} />);
    expect(screen.getByText(/Required class checks are ready/)).toBeDefined();
    expect(within(card('Camera')).getByText('Not checked')).toBeDefined();
    expect(within(card('Offline resources')).getByText('Needs attention')).toBeDefined();
  });

  it('does not prompt for camera permission or persistence during passive checks', async () => {
    const { getUserMedia, persist } = browser('prompt');
    render(<PreClassReadiness config={config} rosterCount={2} />);
    await screen.findByText(/Camera permission: will be requested only/);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(screen.getByText(/Browsers may hide devices before permission/)).toBeDefined();
    expect(within(card('Camera')).getByText('Not checked')).toBeDefined();
  });

  it('releases every track on successful explicit camera test without claiming QR decoding', async () => {
    const { getUserMedia } = browser();
    const { stream, stop, audioStop } = videoStream();
    getUserMedia.mockResolvedValue(stream);
    render(<PreClassReadiness config={config} rosterCount={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Test camera' }));
    await screen.findByText(/Camera opened successfully and all tracks were released/);
    expect(stop).toHaveBeenCalledOnce();
    expect(audioStop).toHaveBeenCalledOnce();
    expect(within(card('Camera')).getByText('Ready')).toBeDefined();
    expect(screen.getByText(/QR decoding has not been tested/)).toBeDefined();
  });

  it('releases tracks after a failed stream check', async () => {
    const { getUserMedia } = browser();
    const { stream, stop, audioStop } = videoStream(false);
    getUserMedia.mockResolvedValue(stream);
    render(<PreClassReadiness config={config} rosterCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test camera' }));
    await screen.findByText(/Camera test failed: No live video track/);
    expect(stop).toHaveBeenCalledOnce();
    expect(audioStop).toHaveBeenCalledOnce();
  });

  it('releases streams that resolve after the checklist unmounts', async () => {
    const { getUserMedia } = browser();
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount } = render(<PreClassReadiness config={config} rosterCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test camera' }));
    unmount();
    const { stream, stop, audioStop } = videoStream();
    await act(async () => {
      resolve(stream);
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(audioStop).toHaveBeenCalledOnce();
  });

  it('explains camera denial while preserving readiness for manual attendance', async () => {
    const { getUserMedia } = browser();
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<PreClassReadiness config={config} rosterCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test camera' }));
    await screen.findByText(/Camera test failed: Camera permission was denied/);
    expect(within(card('Camera')).getByText('Needs attention')).toBeDefined();
    expect(screen.getByText(/Required class checks are ready/)).toBeDefined();
    expect(
      screen.getByText(/Camera test failed:.*Manual attendance remains available/),
    ).toBeDefined();
  });

  it('handles unavailable camera APIs and partial storage evidence as unknown or unsupported', async () => {
    vi.stubGlobal('navigator', {});
    render(<PreClassReadiness config={config} rosterCount={2} />);
    await screen.findByText(/Camera access is unavailable/);
    expect(within(card('Camera')).getByText('Not applicable')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Test camera' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(card('Browser storage')).getByText('Not applicable')).toBeDefined();
  });

  it('refreshes safe evidence and rejects stale asynchronous results when the class changes', async () => {
    const { persisted } = browser();
    let resolve!: (result: boolean) => void;
    persisted
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(false);
    const { rerender } = render(<PreClassReadiness config={config} rosterCount={2} />);
    await waitFor(() => expect(persisted).toHaveBeenCalledOnce());
    rerender(<PreClassReadiness config={{ ...config, section: 'B' }} rosterCount={3} />);
    await screen.findByText(/Persistent storage is not granted/);
    await act(async () => {
      resolve(true);
    });
    expect(screen.queryByText(/Persistent storage is granted for this site/)).toBeNull();
    expect(screen.getByText('3 students match the selected section.')).toBeDefined();
  });

  it('distinguishes current-page backup observations from saved files and independent recovery', async () => {
    const vault = `ui-vault-${Math.random()}`;
    const { rerender } = render(
      <PreClassReadiness config={config} rosterCount={2} vaultId={vault} />,
    );
    await screen.findByText(/No backup download request has been observed/);
    act(() => {
      recordBackupRequested(vault);
      recordRestoreCompleted(vault);
    });
    expect(
      screen.getByText(/Saving the file outside this device has not been verified/),
    ).toBeDefined();
    expect(screen.getByText(/This does not verify recovery on another device/)).toBeDefined();
    expect(within(card('Backup and recovery evidence')).getByText('Not checked')).toBeDefined();
    rerender(<PreClassReadiness config={config} rosterCount={2} vaultId={`${vault}-different`} />);
    expect(screen.getByText(/No completed restore has been observed/)).toBeDefined();
    expect(screen.getByText(/Earlier backup activity is unknown/)).toBeDefined();
  });

  it('supports keyboard actions without submitting the enclosing session form', async () => {
    const review = vi.fn();
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <PreClassReadiness config={config} rosterCount={0} onReviewRoster={review} />
      </form>,
    );
    await screen.findByRole('button', { name: 'Refresh safe checks' });
    screen.getByRole('button', { name: 'Review roster' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(review).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole('button').every((button) => button.getAttribute('type') === 'button'),
    ).toBe(true);
  });
});
