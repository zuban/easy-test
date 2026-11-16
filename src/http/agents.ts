import http from 'node:http';
import https from 'node:https';

/**
 * Keep-alive agents owned by one measurement session.
 *
 * Requests within a session reuse a single TCP/TLS connection, so only the first
 * one pays for DNS + handshake. When the network changes, the whole pool is
 * destroyed: sockets opened on the old network are dead and must not be reused.
 */
export interface AgentPool {
  readonly http: http.Agent;
  readonly https: https.Agent;
  destroy(): void;
}

export function createAgentPool(): AgentPool {
  // Requests are strictly sequential, so one socket per origin is enough.
  const options = { keepAlive: true, maxSockets: 1 };
  const pool = {
    http: new http.Agent(options),
    https: new https.Agent(options),
    destroy() {
      pool.http.destroy();
      pool.https.destroy();
    },
  };
  return pool;
}
