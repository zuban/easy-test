import { describeError } from './errors.js';
import { describeSnapshot } from './network/snapshot.js';
import type { NetworkChange, NetworkChangeSource } from './network/watcher.js';
import type { Reporter } from './reporter.js';
import type { MeasurementSession } from './session.js';

export interface WatchModeOptions {
  readonly watcher: NetworkChangeSource;
  readonly session: MeasurementSession;
  readonly reporter: Reporter;
  /** Aborted on Ctrl+C — stops watching and cancels the running measurement. */
  readonly signal: AbortSignal;
}

/**
 * Measures once right away, then again after every network change.
 * A change in the middle of a measurement cancels it: numbers mixed from two
 * different networks are meaningless.
 */
export async function runWatchMode({ watcher, session, reporter, signal }: WatchModeOptions): Promise<void> {
  let running: AbortController | undefined;

  const measure = async (): Promise<void> => {
    running?.abort();
    const controller = new AbortController();
    running = controller;
    const stopOnExit = () => controller.abort();
    signal.addEventListener('abort', stopOnExit, { once: true });

    try {
      await session(controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return; // superseded by a newer session or Ctrl+C
      reporter.error(describeError(err));
    } finally {
      signal.removeEventListener('abort', stopOnExit);
      if (running === controller) running = undefined;
    }
    if (!signal.aborted) reporter.info('\nWaiting for network changes… (Ctrl+C to exit)');
  };

  const onChange = ({ before, after }: NetworkChange) => {
    const interrupted = running ? ' Current measurement cancelled.' : '';
    reporter.info(`\nNetwork changed: ${describeSnapshot(before)} → ${describeSnapshot(after)}.${interrupted}\n`);
    void measure();
  };

  if (signal.aborted) return;
  watcher.on('change', onChange);
  const baseline = watcher.start();
  reporter.info(`Watching network: ${describeSnapshot(baseline)}\n`);

  try {
    void measure();
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  } finally {
    watcher.stop();
    running?.abort();
  }
}
