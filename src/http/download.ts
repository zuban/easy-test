import http from 'node:http';
import https from 'node:https';
import type { AgentPool } from './agents.js';
import { HttpStatusError, InactivityTimeoutError, RedirectError } from '../errors.js';

export interface DownloadOptions {
  readonly agents?: AgentPool;
  readonly signal?: AbortSignal;
  /** Abort if the socket stays silent for this long (not a cap on total time). */
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
}

export interface DownloadResult {
  /** Body bytes as received over the wire (no decompression is applied). */
  readonly bytes: number;
  /** From sending the first request to receiving the last body byte, ms. */
  readonly durationMs: number;
  readonly status: number;
  readonly finalUrl: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const HEADERS = {
  accept: '*/*',
  // Ask for the raw representation so the byte count equals what was transferred.
  'accept-encoding': 'identity',
  'user-agent': 'easy-speedtest/1.0 (+https://github.com/zuban/easy-test)',
};

type Hop =
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'done'; readonly status: number; readonly bytes: number };

/**
 * Downloads `url` to the end without keeping the body in memory: chunks are only
 * counted and dropped. Redirects are followed; their time counts toward the total
 * because the user is waiting for them too.
 */
export async function download(url: URL, options: DownloadOptions = {}): Promise<DownloadResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const startedAt = performance.now();
  let current = url;

  for (let redirects = 0; ; redirects++) {
    const hop = await requestOnce(current, options);
    if (hop.kind === 'done') {
      return {
        bytes: hop.bytes,
        durationMs: performance.now() - startedAt,
        status: hop.status,
        finalUrl: current.href,
      };
    }
    if (redirects >= maxRedirects) {
      throw new RedirectError(`Too many redirects (more than ${maxRedirects})`);
    }
    current = new URL(hop.location, current);
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new RedirectError(`Unsupported redirect target: ${current.href}`);
    }
  }
}

function requestOnce(url: URL, options: DownloadOptions): Promise<Hop> {
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<Hop>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: 'GET',
        headers: HEADERS,
        agent: isHttps ? options.agents?.https : options.agents?.http,
        signal: options.signal,
      },
      (res) => {
        res.on('error', reject);
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        if (REDIRECT_STATUSES.has(status) && location) {
          // Drain the (usually tiny) body so the socket goes back to the pool.
          res.resume();
          res.on('end', () => resolve({ kind: 'redirect', location }));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new HttpStatusError(status, url.href));
          return;
        }

        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        res.on('end', () => resolve({ kind: 'done', status, bytes }));
      },
    );

    req.setTimeout(timeoutMs, () => req.destroy(new InactivityTimeoutError(timeoutMs)));
    req.on('error', reject);
    req.end();
  });
}
