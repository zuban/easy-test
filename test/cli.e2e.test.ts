import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from './helpers/server.js';

// Runs the compiled CLI (`npm test` builds it first via the `pretest` script).
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const exec = promisify(execFile);

async function run(...args: string[]) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());

describe('speedtest CLI', () => {
  it('downloads the URL 10 times and prints the summary', async () => {
    const { code, stdout } = await run(server.url('/bytes/5000000').href);

    expect(code).toBe(0);
    expect(stdout.match(/^\s+#\d+\s+5\.00 MB/gm)).toHaveLength(10);
    expect(stdout).toMatch(/Requests:\s+10$/m);
    expect(stdout).toMatch(/Average time:\s+\d+ ms$/m);
    expect(stdout).toMatch(/Total downloaded:\s+50\.00 MB$/m);
    expect(stdout).toMatch(/Download speed:\s+[\d.]+ Mbit\/s \([\d.]+ MB\/s\)$/m);
  });

  it('respects --count', async () => {
    const { code, stdout } = await run(server.url('/bytes/1000').href, '-n', '3');
    expect(code).toBe(0);
    expect(stdout).toMatch(/Total downloaded:\s+0\.00 MB$/m);
    expect(stdout.match(/^\s+#\d+/gm)).toHaveLength(3);
  });

  it('exits with 1 on HTTP errors', async () => {
    const { code, stderr } = await run(server.url('/missing').href);
    expect(code).toBe(1);
    expect(stderr).toContain('HTTP 404');
  });

  it('exits with 2 and prints usage on bad arguments', async () => {
    const { code, stderr } = await run();
    expect(code).toBe(2);
    expect(stderr).toContain('URL is required');
    expect(stderr).toContain('Usage: speedtest');
  });
});
