import { parseArgs } from 'node:util';
import { UsageError } from './errors.js';

export interface CliOptions {
  readonly url: URL;
  readonly count: number;
  readonly timeoutMs: number;
  readonly watch: boolean;
  readonly pollIntervalMs: number;
}

export type ParsedArgs = { readonly kind: 'help' } | { readonly kind: 'run'; readonly options: CliOptions };

export const DEFAULTS = {
  count: 10,
  timeoutMs: 30_000,
  pollIntervalMs: 2_000,
} as const;

export const USAGE = `Usage: speedtest <url> [options]

Downloads <url> several times in a row and prints the average request time,
the total amount of data and the download speed (Mbit/s).

Options:
  -n, --count <n>          number of sequential requests (default: ${DEFAULTS.count})
  -t, --timeout <ms>       abort a request after <ms> without data (default: ${DEFAULTS.timeoutMs})
  -w, --watch              keep running; re-measure every time the network changes
      --poll-interval <ms> how often to check network interfaces in watch mode (default: ${DEFAULTS.pollIntervalMs})
  -h, --help               show this help
`;

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        count: { type: 'string', short: 'n' },
        timeout: { type: 'string', short: 't' },
        watch: { type: 'boolean', short: 'w', default: false },
        'poll-interval': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }

  const { values, positionals } = parsed;
  if (values.help) return { kind: 'help' };

  if (positionals.length === 0) throw new UsageError('URL is required');
  if (positionals.length > 1) throw new UsageError(`Expected one URL, got ${positionals.length}`);

  return {
    kind: 'run',
    options: {
      url: parseHttpUrl(positionals[0]!),
      count: parseInteger(values.count, 'count', DEFAULTS.count, 1, 1_000),
      timeoutMs: parseInteger(values.timeout, 'timeout', DEFAULTS.timeoutMs, 1, 3_600_000),
      watch: values.watch,
      pollIntervalMs: parseInteger(values['poll-interval'], 'poll-interval', DEFAULTS.pollIntervalMs, 100, 600_000),
    },
  };
}

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError(`Only http:// and https:// URLs are supported, got ${url.protocol}`);
  }
  return url;
}

function parseInteger(raw: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new UsageError(`--${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}
