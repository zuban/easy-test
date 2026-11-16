import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpStatusError, InactivityTimeoutError, RedirectError } from '../src/errors.js';
import { createAgentPool } from '../src/http/agents.js';
import { download } from '../src/http/download.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());

describe('download', () => {
  it('counts every body byte and measures time', async () => {
    const result = await download(server.url('/bytes/1234567'));
    expect(result.bytes).toBe(1_234_567);
    expect(result.status).toBe(200);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('asks for an uncompressed body', async () => {
    await download(server.url('/bytes/1'));
    expect(server.lastHeaders?.['accept-encoding']).toBe('identity');
  });

  it('follows redirects and counts only the final body', async () => {
    const result = await download(server.url('/redirect'));
    expect(result.bytes).toBe(1000);
    expect(result.finalUrl).toBe(server.url('/bytes/1000').href);
  });

  it('gives up on redirect loops', async () => {
    await expect(download(server.url('/loop'), { maxRedirects: 3 })).rejects.toBeInstanceOf(RedirectError);
  });

  it('fails on non-2xx status', async () => {
    const error = await download(server.url('/missing')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(404);
  });

  it('fails when the server goes silent', async () => {
    await expect(download(server.url('/stall'), { timeoutMs: 200 })).rejects.toBeInstanceOf(InactivityTimeoutError);
  });

  it('can be cancelled mid-body', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    await expect(download(server.url('/stall'), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('reuses one keep-alive connection within an agent pool', async () => {
    const agents = createAgentPool();
    const before = server.connections;
    try {
      for (let i = 0; i < 5; i++) await download(server.url('/bytes/100000'), { agents });
    } finally {
      agents.destroy();
    }
    expect(server.connections - before).toBe(1);
  });
});
