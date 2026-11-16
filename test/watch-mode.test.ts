import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { takeSnapshot } from '../src/network/snapshot.js';
import type { NetworkChange, NetworkChangeSource } from '../src/network/watcher.js';
import type { Reporter } from '../src/reporter.js';
import type { MeasurementSession } from '../src/session.js';
import { runWatchMode } from '../src/watch-mode.js';

const EMPTY = takeSnapshot({});

class FakeWatcher extends EventEmitter implements NetworkChangeSource {
  start = vi.fn(() => EMPTY);
  stop = vi.fn();
  change(): void {
    this.emit('change', { before: EMPTY, after: EMPTY } satisfies NetworkChange);
  }
}

function fakeReporter(): Reporter & { lines: string[] } {
  const lines: string[] = [];
  const push = (m: string) => void lines.push(m);
  return { lines, start: vi.fn(), sample: vi.fn(), summary: vi.fn(), info: push, error: (m) => push(`ERROR ${m}`) };
}

/** A session that never finishes on its own — it only ends when cancelled. */
function pendingSession() {
  const signals: AbortSignal[] = [];
  const session: MeasurementSession = (signal) => {
    signals.push(signal);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  };
  return { session, signals };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('runWatchMode', () => {
  it('measures immediately, restarts on network change and cancels the stale run', async () => {
    const watcher = new FakeWatcher();
    const reporter = fakeReporter();
    const { session, signals } = pendingSession();
    const stop = new AbortController();

    const done = runWatchMode({ watcher, session, reporter, signal: stop.signal });
    await tick();
    expect(watcher.start).toHaveBeenCalledOnce();
    expect(signals).toHaveLength(1);

    watcher.change();
    await tick();
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    expect(reporter.lines.some((l) => l.includes('Current measurement cancelled'))).toBe(true);

    stop.abort();
    await done;
    expect(signals[1]!.aborted).toBe(true);
    expect(watcher.stop).toHaveBeenCalledOnce();
    expect(reporter.lines.some((l) => l.startsWith('ERROR'))).toBe(false);
  });

  it('keeps watching after a failed measurement', async () => {
    const watcher = new FakeWatcher();
    const reporter = fakeReporter();
    const session = vi.fn<MeasurementSession>().mockRejectedValueOnce(new Error('ENETUNREACH')).mockResolvedValue({
      count: 1,
      totalBytes: 1,
      totalMs: 1,
      avgMs: 1,
      bitsPerSecond: 8000,
    });
    const stop = new AbortController();

    const done = runWatchMode({ watcher, session, reporter, signal: stop.signal });
    await tick();
    expect(reporter.lines).toContain('ERROR ENETUNREACH');

    watcher.change();
    await tick();
    expect(session).toHaveBeenCalledTimes(2);

    stop.abort();
    await done;
  });
});
