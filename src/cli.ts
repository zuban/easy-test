#!/usr/bin/env node
import { parseCliArgs, USAGE } from './args.js';
import { describeError, UsageError } from './errors.js';
import { NetworkWatcher } from './network/watcher.js';
import { createConsoleReporter } from './reporter.js';
import { createMeasurementSession } from './session.js';
import { runWatchMode } from './watch-mode.js';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_INTERRUPTED = 130; // 128 + SIGINT, shell convention

async function main(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`Error: ${err.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (parsed.kind === 'help') {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  const { options } = parsed;
  const reporter = createConsoleReporter();
  const session = createMeasurementSession(options, reporter);

  // Ctrl+C cancels in-flight requests instead of killing the process mid-write.
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());

  if (options.watch) {
    const watcher = new NetworkWatcher({ pollIntervalMs: options.pollIntervalMs });
    await runWatchMode({ watcher, session, reporter, signal: stop.signal });
    reporter.info('\nStopped.');
    return EXIT_OK;
  }

  try {
    await session(stop.signal);
    return EXIT_OK;
  } catch (err) {
    if (stop.signal.aborted) {
      reporter.info('\nInterrupted.');
      return EXIT_INTERRUPTED;
    }
    reporter.error(describeError(err));
    return EXIT_FAILURE;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = EXIT_FAILURE;
  },
);
