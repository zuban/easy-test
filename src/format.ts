// All units are decimal (SI), the same way ISPs and speed tests report them:
// 1 MB = 1 000 000 bytes, 1 Mbit = 1 000 000 bits.
const BYTES_PER_MB = 1_000_000;
const BITS_PER_MBIT = 1_000_000;

export function formatBytes(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

export function formatMbitPerSec(bitsPerSecond: number): string {
  return `${(bitsPerSecond / BITS_PER_MBIT).toFixed(2)} Mbit/s`;
}

export function formatMBPerSec(bitsPerSecond: number): string {
  return `${(bitsPerSecond / 8 / BYTES_PER_MB).toFixed(2)} MB/s`;
}
