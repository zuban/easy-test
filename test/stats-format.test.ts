import { describe, expect, it } from 'vitest';
import { formatBytes, formatMBPerSec, formatMbitPerSec, formatMs } from '../src/format.js';
import { bitsPerSecond, summarize } from '../src/stats.js';

describe('summarize', () => {
  it('computes totals, average time and speed from totals', () => {
    const summary = summarize([
      { bytes: 1_000_000, durationMs: 1000 },
      { bytes: 3_000_000, durationMs: 1000 },
    ]);
    expect(summary).toEqual({
      count: 2,
      totalBytes: 4_000_000,
      totalMs: 2000,
      avgMs: 1000,
      bitsPerSecond: 16_000_000, // 4 MB * 8 / 2 s
    });
  });

  it('uses Σbytes/Σtime, not the mean of per-request speeds', () => {
    // Per-request speeds: 8 Mbit/s and 80 Mbit/s → naive mean would be 44 Mbit/s.
    const summary = summarize([
      { bytes: 1_000_000, durationMs: 1000 },
      { bytes: 1_000_000, durationMs: 100 },
    ]);
    expect(summary.bitsPerSecond).toBeCloseTo(16_000_000 / 1.1);
  });

  it('handles an empty list without dividing by zero', () => {
    expect(summarize([])).toEqual({ count: 0, totalBytes: 0, totalMs: 0, avgMs: 0, bitsPerSecond: 0 });
    expect(bitsPerSecond(100, 0)).toBe(0);
  });
});

describe('format', () => {
  it('uses decimal SI units', () => {
    expect(formatBytes(14_679_474)).toBe('14.68 MB');
    expect(formatMs(693.6)).toBe('694 ms');
    expect(formatMbitPerSec(169_110_000)).toBe('169.11 Mbit/s');
    expect(formatMBPerSec(169_110_000)).toBe('21.14 MB/s');
  });
});
