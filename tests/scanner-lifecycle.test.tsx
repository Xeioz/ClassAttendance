// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScannerView } from '../src/components/teacher/ScannerView';
import { startCamera, type CameraHandle } from '../src/utils/camera';

vi.mock('../src/utils/camera', () => ({ startCamera: vi.fn() }));
const start = vi.mocked(startCamera);
let handle: CameraHandle;
beforeEach(() => {
  handle = {
    hasTorch: true,
    stop: vi.fn().mockResolvedValue(undefined),
    torch: vi.fn().mockResolvedValue(undefined),
  };
  start.mockResolvedValue(handle);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      enumerateDevices: vi.fn().mockRejectedValue(new Error('No permission to list cameras')),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  return render(<ScannerView onScan={async () => {}} onPending={() => {}} />);
}
describe('scanner optional capabilities and cleanup', () => {
  it('stops promptly even when optional device enumeration never settles', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockImplementation(
      () => new Promise(() => {}),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByRole('button', { name: 'Torch on' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    await waitFor(() => expect(handle.stop).toHaveBeenCalledOnce());
  });

  it('serializes repeated torch clicks until the hardware constraint completes', async () => {
    let resolve!: () => void;
    vi.mocked(handle.torch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    const torch = await screen.findByRole('button', { name: 'Torch on' });
    fireEvent.click(torch);
    fireEvent.click(torch);
    expect(handle.torch).toHaveBeenCalledTimes(1);
    expect(handle.torch).toHaveBeenCalledWith(true);
    await act(async () => resolve());
    expect(screen.getByRole('button', { name: 'Torch off' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
  it('keeps scanning when optional device enumeration fails', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByRole('button', { name: 'Torch on' });
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeTruthy();
    expect(handle.stop).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides stale torch controls during restart and stops a handle that resolves after unmount', async () => {
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByRole('button', { name: 'Torch on' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    await waitFor(() => expect(handle.stop).toHaveBeenCalledOnce());
    let resolve!: (value: CameraHandle) => void;
    start.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Torch on' })).toBeNull();
    unmount();
    const late = { ...handle, stop: vi.fn().mockResolvedValue(undefined) };
    await act(async () => resolve(late));
    expect(late.stop).toHaveBeenCalledOnce();
  });

  it('reports torch constraint failures without claiming the torch is on', async () => {
    vi.mocked(handle.torch).mockRejectedValue(new Error('Constraint rejected'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Torch on' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Torch on' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
