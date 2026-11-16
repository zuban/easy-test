import type { NetworkInterfaceInfo } from 'node:os';

export type InterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Order-independent description of the machine's external network addresses. */
export interface NetworkSnapshot {
  /** Sorted "iface family address" entries, e.g. "en0 IPv4 192.168.1.10". */
  readonly entries: readonly string[];
  /** Stable key for cheap equality checks. */
  readonly key: string;
}

// fe80::/10 — link-local IPv6, exists on every interface and says nothing about connectivity.
const LINK_LOCAL_V6 = /^fe[89ab][0-9a-f]:/i;

export function takeSnapshot(interfaces: InterfaceMap): NetworkSnapshot {
  const entries: string[] = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.internal) continue;
      if (info.family === 'IPv6' && LINK_LOCAL_V6.test(info.address)) continue;
      entries.push(`${name} ${info.family} ${info.address}`);
    }
  }
  entries.sort();
  return { entries, key: entries.join('|') };
}

/** Human-readable form: "en0 192.168.1.10, utun4 10.8.0.2" or "offline". */
export function describeSnapshot(snapshot: NetworkSnapshot): string {
  if (snapshot.entries.length === 0) return 'offline';
  return snapshot.entries
    .map((entry) => {
      const [name, , address] = entry.split(' ');
      return `${name} ${address}`;
    })
    .join(', ');
}
