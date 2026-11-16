/** One completed request: how many body bytes arrived and how long it took. */
export interface Sample {
  readonly bytes: number;
  readonly durationMs: number;
}

export interface Summary {
  readonly count: number;
  readonly totalBytes: number;
  readonly totalMs: number;
  /** Mean request duration, ms. */
  readonly avgMs: number;
  /** Overall throughput: total bits / total seconds. */
  readonly bitsPerSecond: number;
}

export function bitsPerSecond(bytes: number, durationMs: number): number {
  return durationMs > 0 ? (bytes * 8) / (durationMs / 1000) : 0;
}

/**
 * Speed is computed from totals (Σbytes / Σtime), not as a mean of per-request
 * speeds: a single fast outlier on a tiny sample must not skew the result.
 */
export function summarize(samples: readonly Sample[]): Summary {
  let totalBytes = 0;
  let totalMs = 0;
  for (const s of samples) {
    totalBytes += s.bytes;
    totalMs += s.durationMs;
  }
  const count = samples.length;
  return {
    count,
    totalBytes,
    totalMs,
    avgMs: count > 0 ? totalMs / count : 0,
    bitsPerSecond: bitsPerSecond(totalBytes, totalMs),
  };
}
