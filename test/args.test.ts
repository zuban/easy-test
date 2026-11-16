import { describe, expect, it } from 'vitest';
import { DEFAULTS, parseCliArgs } from '../src/args.js';
import { UsageError } from '../src/errors.js';

describe('parseCliArgs', () => {
  it('applies defaults (10 requests)', () => {
    const parsed = parseCliArgs(['https://example.com/big.jpg']);
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        url: new URL('https://example.com/big.jpg'),
        count: 10,
        timeoutMs: DEFAULTS.timeoutMs,
        watch: false,
        pollIntervalMs: DEFAULTS.pollIntervalMs,
      },
    });
  });

  it('parses options', () => {
    const parsed = parseCliArgs(['http://x.test/a', '-n', '3', '--timeout', '500', '-w', '--poll-interval', '250']);
    expect(parsed.kind === 'run' && parsed.options).toMatchObject({
      count: 3,
      timeoutMs: 500,
      watch: true,
      pollIntervalMs: 250,
    });
  });

  it('returns help', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it.each([
    [[], /URL is required/],
    [['not a url'], /Invalid URL/],
    [['ftp://example.com/file'], /Only http/],
    [['https://a.test', 'https://b.test'], /Expected one URL/],
    [['https://a.test', '-n', '0'], /--count must be an integer/],
    [['https://a.test', '-n', '2.5'], /--count must be an integer/],
    [['https://a.test', '--bogus'], /Unknown option/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});
