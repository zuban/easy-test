import { summarize, type Sample, type Summary } from './stats.js';

export type Downloader = (url: URL, signal?: AbortSignal) => Promise<Sample>;

export interface BenchmarkOptions {
  readonly url: URL;
  readonly count: number;
  readonly download: Downloader;
  readonly signal?: AbortSignal;
  readonly onSample?: (sample: Sample, index: number) => void;
}

/**
 * Runs `count` downloads strictly one after another: the next request starts
 * only after the previous body has been fully received.
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<Summary> {
  const { url, count, download, signal, onSample } = options;
  const samples: Sample[] = [];

  for (let i = 0; i < count; i++) {
    signal?.throwIfAborted();
    const sample = await download(url, signal);
    // A result that raced with cancellation belongs to a stale session — drop it.
    signal?.throwIfAborted();
    samples.push(sample);
    onSample?.(sample, i);
  }

  return summarize(samples);
}
