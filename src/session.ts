import type { CliOptions } from './args.js';
import { runBenchmark } from './benchmark.js';
import { createAgentPool } from './http/agents.js';
import { download } from './http/download.js';
import type { Reporter } from './reporter.js';
import type { Summary } from './stats.js';

/** One full measurement: N requests + summary. Cancelled via `signal`. */
export type MeasurementSession = (signal: AbortSignal) => Promise<Summary>;

export function createMeasurementSession(
  options: Pick<CliOptions, 'url' | 'count' | 'timeoutMs'>,
  reporter: Reporter,
): MeasurementSession {
  const { url, count, timeoutMs } = options;

  return async (signal) => {
    // Fresh connection pool per session: never reuse sockets from a previous network.
    const agents = createAgentPool();
    try {
      reporter.start(url, count);
      const summary = await runBenchmark({
        url,
        count,
        signal,
        download: (target, s) => download(target, { agents, signal: s, timeoutMs }),
        onSample: (sample, index) => reporter.sample(sample, index, count),
      });
      reporter.summary(summary);
      return summary;
    } finally {
      agents.destroy();
    }
  };
}
