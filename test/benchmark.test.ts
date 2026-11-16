import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { runBenchmark } from '../src/benchmark.js';

const url = new URL('http://example.test/file');

describe('runBenchmark', () => {
  it('runs exactly N requests strictly one after another', async () => {
    let active = 0;
    let maxActive = 0;
    const download = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active--;
      return { bytes: 1_000, durationMs: 10 };
    });
    const onSample = vi.fn();

    const summary = await runBenchmark({ url, count: 10, download, onSample });

    expect(download).toHaveBeenCalledTimes(10);
    expect(maxActive).toBe(1);
    expect(onSample).toHaveBeenCalledTimes(10);
    expect(onSample).toHaveBeenLastCalledWith({ bytes: 1_000, durationMs: 10 }, 9);
    expect(summary).toMatchObject({ count: 10, totalBytes: 10_000, totalMs: 100, avgMs: 10 });
  });

  it('stops when the signal is aborted and drops the in-flight result', async () => {
    const controller = new AbortController();
    const download = vi.fn(async () => {
      if (download.mock.calls.length === 3) controller.abort();
      return { bytes: 1, durationMs: 1 };
    });
    const onSample = vi.fn();

    await expect(runBenchmark({ url, count: 10, download, onSample, signal: controller.signal })).rejects.toThrow();
    expect(download).toHaveBeenCalledTimes(3);
    expect(onSample).toHaveBeenCalledTimes(2);
  });

  it('propagates download errors', async () => {
    const download = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(runBenchmark({ url, count: 10, download })).rejects.toThrow('boom');
    expect(download).toHaveBeenCalledTimes(1);
  });
});
