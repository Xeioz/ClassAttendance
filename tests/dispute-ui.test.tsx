// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DisputePanel } from '../src/components/teacher/DisputePanel';
import { TeacherWorkspace } from '../src/components/teacher/TeacherWorkspace';
import { flagDispute, readAudit } from '../src/domain/audit';
import { createSession, recordAttendance, saveRoster } from '../src/domain/attendance';
import { db } from '../src/db/db';
import { unlockVault } from '../src/db/vault';
import type { ScanResult, Session, VaultKeys } from '../src/types';

vi.mock('../src/domain/audit', async (load) => ({
  ...(await load<typeof import('../src/domain/audit')>()),
  flagDispute: vi.fn(),
}));
vi.mock('../src/domain/attendance', async (load) => {
  const original = await load<typeof import('../src/domain/attendance')>();
  return { ...original, recordAttendance: vi.fn(original.recordAttendance) };
});
let scanOnMount: string | undefined;
let scanner: {
  onScan: (raw: string) => Promise<void>;
  onPending: (pending: boolean) => void;
  paused: boolean;
};
vi.mock('../src/components/teacher/ScannerView', () => ({
  ScannerView: (props: typeof scanner) => {
    scanner = props;
    useLayoutEffect(() => {
      if (scanOnMount) void props.onScan(scanOnMount);
    }, []);
    return <p>{props.paused ? 'Test camera paused' : 'Test camera running'}</p>;
  },
}));
const keys = {} as VaultKeys;
const session: Session = {
  id: 'session-1',
  state: 'ACTIVE',
  course: 'QA',
  section: 'A',
  roomPin: '492',
  startsAt: 1000,
  graceMinutes: 15,
  roster: [
    { token: 'alice', id: '001', displayId: '00-1', name: 'Alice', section: 'A' },
    { token: 'bob', id: '002', name: 'Bob', section: 'A' },
  ],
};
const alice: ScanResult = {
  kind: 'duplicate',
  title: 'Already recorded',
  detail: 'Alice duplicate',
  studentToken: 'alice',
  firstAt: 1000,
  secondAt: 2000,
};
const bob: ScanResult = {
  kind: 'duplicate',
  title: 'Already recorded',
  detail: 'Bob duplicate',
  studentToken: 'bob',
  firstAt: 3000,
  secondAt: 4000,
};
const onChanged = vi.fn(async () => {});
const onReviewChange = vi.fn();
const panel = (candidate: ScanResult, selected = session) => (
  <DisputePanel
    keys={keys}
    session={selected}
    events={[]}
    candidate={candidate}
    onChanged={onChanged}
    onReviewChange={onReviewChange}
  />
);
function start(reason = 'Alice identity mismatch') {
  const review = screen.queryByRole('button', { name: 'Review duplicate check-in' });
  // The original UI exposed the reason immediately; allow that path so the
  // regression fails on wrong ownership, rather than only on the new button.
  if (review) fireEvent.click(review);
  fireEvent.change(screen.getByLabelText('Reason for disputing this check-in'), {
    target: { value: reason },
  });
}
beforeEach(async () => {
  scanOnMount = undefined;
  vi.stubGlobal('crypto', webcrypto);
  vi.clearAllMocks();
  vi.mocked(flagDispute).mockReset().mockResolvedValue(undefined);
  const original = await vi.importActual<typeof import('../src/domain/attendance')>(
    '../src/domain/attendance',
  );
  vi.mocked(recordAttendance).mockReset().mockImplementation(original.recordAttendance);
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('stable duplicate dispute review', () => {
  it('displays legitimate epoch-zero presentation times instead of Unknown', () => {
    render(
      <DisputePanel
        keys={keys}
        session={session}
        events={[
          {
            eventId: 'epoch-dispute',
            sessionId: session.id,
            action: 'DISPUTE_FLAGGED',
            at: 0,
            performedBy: 'TEACHER_PIN',
            studentToken: 'alice',
            disputeId: 'epoch-dispute',
            firstAt: 0,
            secondAt: 0,
            reason: 'Synthetic historical review',
          },
        ]}
        onChanged={onChanged}
      />,
    );
    expect(
      screen.getByText(`First presentation: ${new Date(0).toLocaleString()}`, { exact: false }),
    ).toBeTruthy();
    expect(
      screen.getByText(`Second presentation: ${new Date(0).toLocaleString()}`, { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByText(/presentation: Unknown/)).toBeNull();
  });
  it('binds reason and both timestamps to Alice when a later scan changes to Bob', async () => {
    const { rerender } = render(panel(alice));
    start();
    rerender(panel(bob));
    fireEvent.click(screen.getByRole('button', { name: 'Flag disputed check-in' }));
    await waitFor(() =>
      expect(flagDispute).toHaveBeenCalledWith(
        keys,
        'session-1',
        'alice',
        'Alice identity mismatch',
        2000,
        1000,
      ),
    );
    await waitFor(() => expect(onReviewChange).toHaveBeenLastCalledWith(false));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('preserves the correct draft on failure and retries without retargeting', async () => {
    vi.mocked(flagDispute).mockRejectedValueOnce(new Error('Temporary write failure'));
    const { rerender } = render(panel(alice));
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Flag disputed check-in' }));
    await screen.findByText('Temporary write failure');
    rerender(panel(bob));
    expect(
      (screen.getByLabelText('Reason for disputing this check-in') as HTMLTextAreaElement).value,
    ).toBe('Alice identity mismatch');
    expect(onReviewChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Flag disputed check-in' }));
    await waitFor(() => expect(flagDispute).toHaveBeenCalledTimes(2));
    expect(vi.mocked(flagDispute).mock.calls[1]).toEqual([
      keys,
      'session-1',
      'alice',
      'Alice identity mismatch',
      2000,
      1000,
    ]);
    await waitFor(() =>
      expect(screen.queryByLabelText('Reason for disputing this check-in')).toBeNull(),
    );
  });

  it('cancels all draft fields before reviewing another candidate or session', () => {
    const { rerender } = render(panel(alice));
    start();
    rerender(panel(bob));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel dispute review' }));
    expect(onReviewChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Review duplicate check-in' }));
    expect(screen.getByText('Reviewing Bob · 002')).toBeTruthy();
    expect(
      (screen.getByLabelText('Reason for disputing this check-in') as HTMLTextAreaElement).value,
    ).toBe('');
    fireEvent.change(screen.getByLabelText('Reason for disputing this check-in'), {
      target: { value: 'Bob review' },
    });
    rerender(panel(alice, { ...session, id: 'session-2' }));
    expect(screen.queryByLabelText('Reason for disputing this check-in')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review duplicate check-in' }));
    expect(
      (screen.getByLabelText('Reason for disputing this check-in') as HTMLTextAreaElement).value,
    ).toBe('');
    expect(flagDispute).not.toHaveBeenCalled();
  });

  it('does not clear a new-session review when an older submission finishes', async () => {
    let finish!: () => void;
    vi.mocked(flagDispute).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(panel(alice));
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Flag disputed check-in' }));
    rerender(panel(bob, { ...session, id: 'session-2' }));
    start('Bob current review');
    await act(async () => {
      finish();
    });
    expect(screen.getByText('Reviewing Bob · 002')).toBeTruthy();
    expect(
      (screen.getByLabelText('Reason for disputing this check-in') as HTMLTextAreaElement).value,
    ).toBe('Bob current review');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('keeps a fast first scan when the newly mounted dispute panel reports its idle state', async () => {
    const liveKeys = await unlockVault('104928573612');
    await saveRoster(liveKeys, [{ id: '001', name: 'Alice', section: 'A' }]);
    const now = Date.now();
    const liveSession = await createSession(liveKeys, {
      course: 'QA',
      section: 'A',
      roomPin: '492',
      startsAt: now,
      graceMinutes: 15,
    });
    // Complete a result during scanner mount, before the dispute panel's passive
    // idle notification. That notification must not cancel an unrelated scan.
    vi.mocked(recordAttendance).mockResolvedValueOnce({
      ...alice,
      studentToken: liveSession.roster[0].token,
    });
    scanOnMount = 'fast initial decoder result';
    render(<TeacherWorkspace keys={liveKeys} onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Review duplicate check-in' });
    expect(screen.getByText('Test camera running')).toBeTruthy();
  });

  it('pauses the workspace scanner and discards a pre-review in-flight result after cancellation', async () => {
    const liveKeys = await unlockVault('104928573612');
    await saveRoster(liveKeys, [
      { id: '001', name: 'Alice', section: 'A' },
      { id: '002', name: 'Bob', section: 'A' },
    ]);
    const now = Date.now();
    const liveSession = await createSession(liveKeys, {
      course: 'QA',
      section: 'A',
      roomPin: '492',
      startsAt: now,
      graceMinutes: 15,
    });
    const raw = (id: string) => JSON.stringify({ v: 1, id, ch: '492', ts: Math.floor(now / 1000) });
    await recordAttendance(liveKeys, liveSession.id, { raw: raw('001') }, now);
    render(<TeacherWorkspace keys={liveKeys} onActive={() => {}} />);
    await screen.findByRole('button', { name: 'Manual check-in / correction (F2)' });
    await act(async () => {
      await scanner.onScan(raw('001'));
    });
    await screen.findByRole('button', { name: 'Review duplicate check-in' });
    let finish!: (result: ScanResult) => void;
    vi.mocked(recordAttendance).mockImplementationOnce(
      () =>
        new Promise<ScanResult>((resolve) => {
          finish = resolve;
        }),
    );
    let inFlight!: Promise<void>;
    act(() => {
      inFlight = scanner.onScan(raw('002'));
    });
    start();
    expect(screen.getByText('Test camera paused')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Manual check-in / correction (F2)',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel dispute review' }));
    await act(async () => {
      finish(bob);
      await inFlight;
    });
    expect(screen.getByText('Test camera running')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review duplicate check-in' })).toBeNull();
    expect(screen.queryByLabelText('Reason for disputing this check-in')).toBeNull();
  });

  it('rejects a stale first presentation without adding a dispute and preserves valid review timestamps', async () => {
    const realAudit =
      await vi.importActual<typeof import('../src/domain/audit')>('../src/domain/audit');
    const liveKeys = await unlockVault('104928573612');
    await saveRoster(liveKeys, [{ id: '001', name: 'Alice', section: 'A' }]);
    const now = Date.now();
    const liveSession = await createSession(liveKeys, {
      course: 'QA',
      section: 'A',
      roomPin: '492',
      startsAt: now,
      graceMinutes: 15,
    });
    const token = liveSession.roster[0].token;
    await recordAttendance(
      liveKeys,
      liveSession.id,
      { student: liveSession.roster[0], reason: 'Manual check-in' },
      now,
    );
    const before = await db.scanEvents.toArray();
    await expect(
      realAudit.flagDispute(
        liveKeys,
        liveSession.id,
        token,
        'Review identity',
        now + 1000,
        now - 1,
      ),
    ).rejects.toThrow('original attendance changed');
    expect(await db.scanEvents.toArray()).toEqual(before);
    await realAudit.flagDispute(
      liveKeys,
      liveSession.id,
      token,
      'Review identity',
      now + 1000,
      now,
    );
    const flagged = (await readAudit(liveKeys, liveSession.id)).find(
      (event) => event.action === 'DISPUTE_FLAGGED',
    );
    expect(flagged).toMatchObject({
      studentToken: token,
      firstAt: now,
      secondAt: now + 1000,
      reason: 'Review identity',
    });
  });
});
