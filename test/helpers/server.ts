import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url(path: string): URL;
  /** TCP connections accepted so far — used to verify keep-alive reuse. */
  readonly connections: number;
  readonly lastHeaders: http.IncomingHttpHeaders | undefined;
  close(): Promise<void>;
}

const CHUNK = Buffer.alloc(64 * 1024, 0x61);

/**
 * Local HTTP server with a few deterministic routes:
 *   /bytes/<n>  — exactly n body bytes
 *   /redirect   — 302 → /bytes/1000
 *   /loop       — redirects to itself forever
 *   /stall      — sends headers and 10 bytes, then goes silent
 *   anything else — 404
 */
export async function startTestServer(): Promise<TestServer> {
  let connections = 0;
  let lastHeaders: http.IncomingHttpHeaders | undefined;

  const server = http.createServer((req, res) => {
    lastHeaders = req.headers;
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const bytes = /^\/bytes\/(\d+)$/.exec(pathname);

    if (bytes) return sendBytes(res, Number(bytes[1]));
    if (pathname === '/redirect') return void res.writeHead(302, { location: '/bytes/1000' }).end();
    if (pathname === '/loop') return void res.writeHead(302, { location: '/loop' }).end();
    if (pathname === '/stall') {
      res.writeHead(200, { 'content-length': '1000' });
      res.write(CHUNK.subarray(0, 10));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });
  server.on('connection', () => connections++);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => new URL(path, `http://127.0.0.1:${port}`),
    get connections() {
      return connections;
    },
    get lastHeaders() {
      return lastHeaders;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Streams `total` bytes respecting backpressure, without allocating the whole body. */
function sendBytes(res: http.ServerResponse, total: number): void {
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(total) });
  let left = total;
  const pump = () => {
    while (left > 0) {
      const size = Math.min(left, CHUNK.length);
      left -= size;
      if (!res.write(size === CHUNK.length ? CHUNK : CHUNK.subarray(0, size))) {
        res.once('drain', pump);
        return;
      }
    }
    res.end();
  };
  pump();
}
