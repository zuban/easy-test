import type { Writable } from 'node:stream';
import { formatBytes, formatMBPerSec, formatMbitPerSec, formatMs } from './format.js';
import { bitsPerSecond, type Sample, type Summary } from './stats.js';

export interface Reporter {
  start(url: URL, count: number): void;
  sample(sample: Sample, index: number, count: number): void;
  summary(summary: Summary): void;
  info(message: string): void;
  error(message: string): void;
}

export function createConsoleReporter(
  out: Writable = process.stdout,
  err: Writable = process.stderr,
): Reporter {
  const line = (stream: Writable, text = '') => stream.write(`${text}\n`);

  return {
    start(url, count) {
      line(out, `Downloading ${url.href}`);
      line(out, `${count} sequential request${count === 1 ? '' : 's'}\n`);
    },

    sample(sample, index, count) {
      const width = String(count).length;
      const n = `#${index + 1}`.padEnd(width + 1);
      const size = formatBytes(sample.bytes).padStart(12);
      const time = formatMs(sample.durationMs).padStart(10);
      const speed = formatMbitPerSec(bitsPerSecond(sample.bytes, sample.durationMs)).padStart(16);
      line(out, `  ${n}${size}${time}${speed}`);
    },

    summary(s) {
      line(out);
      line(out, `Requests:         ${s.count}`);
      line(out, `Average time:     ${formatMs(s.avgMs)}`);
      line(out, `Total downloaded: ${formatBytes(s.totalBytes)}`);
      line(out, `Download speed:   ${formatMbitPerSec(s.bitsPerSecond)} (${formatMBPerSec(s.bitsPerSecond)})`);
    },

    info(message) {
      line(out, message);
    },

    error(message) {
      line(err, `Error: ${message}`);
    },
  };
}
