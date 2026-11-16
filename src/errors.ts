export class HttpStatusError extends Error {
  override readonly name = 'HttpStatusError';

  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Server responded with HTTP ${status} for ${url}`);
  }
}

export class InactivityTimeoutError extends Error {
  override readonly name = 'InactivityTimeoutError';

  constructor(readonly timeoutMs: number) {
    super(`No data received for ${timeoutMs} ms`);
  }
}

export class RedirectError extends Error {
  override readonly name = 'RedirectError';
}

export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code && !err.message.includes(code) ? `${err.message} (${code})` : err.message;
  }
  return String(err);
}
