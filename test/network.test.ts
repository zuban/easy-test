import type { NetworkInterfaceInfo } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeSnapshot, takeSnapshot, type InterfaceMap } from '../src/network/snapshot.js';
import { NetworkWatcher } from '../src/network/watcher.js';

function iface(address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false): NetworkInterfaceInfo {
  const base = { address, netmask: '', mac: '00:00:00:00:00:00', internal, cidr: null };
  return family === 'IPv4' ? { ...base, family } : { ...base, family, scopeid: 0 };
}

const LOOPBACK = { lo0: [iface('127.0.0.1', 'IPv4', true), iface('::1', 'IPv6', true)] };
const WIFI: InterfaceMap = { ...LOOPBACK, en0: [iface('192.168.1.10'), iface('fe80::1', 'IPv6')] };
const ETHERNET: InterfaceMap = { ...LOOPBACK, en5: [iface('10.0.0.7')] };
const OFFLINE: InterfaceMap = { ...LOOPBACK };

describe('takeSnapshot', () => {
  it('ignores loopback and link-local IPv6', () => {
    expect(takeSnapshot(WIFI).entries).toEqual(['en0 IPv4 192.168.1.10']);
    expect(describeSnapshot(takeSnapshot(WIFI))).toBe('en0 192.168.1.10');
    expect(describeSnapshot(takeSnapshot(OFFLINE))).toBe('offline');
  });

  it('does not depend on interface or address order', () => {
    const a = { en0: [iface('192.168.1.10'), iface('2001:db8::1', 'IPv6')], utun4: [iface('10.8.0.2')] };
    const b = { utun4: [iface('10.8.0.2')], en0: [iface('2001:db8::1', 'IPv6'), iface('192.168.1.10')] };
    expect(takeSnapshot(a).key).toBe(takeSnapshot(b).key);
  });
});

describe('NetworkWatcher', () => {
  let current: InterfaceMap;
  let watcher: NetworkWatcher;
  const onChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    current = WIFI;
    onChange.mockReset();
    watcher = new NetworkWatcher({ pollIntervalMs: 1000, debounceMs: 3000, getInterfaces: () => current });
    watcher.on('change', onChange);
  });
  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  it('returns the baseline on start', () => {
    expect(watcher.start().entries).toEqual(['en0 IPv4 192.168.1.10']);
  });

  it('reports a change once it has been stable for the debounce period', () => {
    watcher.start();
    current = ETHERNET;
    vi.advanceTimersByTime(3000); // first seen at 1 s, stable for 2 s so far
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [change] = onChange.mock.calls[0]!;
    expect(describeSnapshot(change.before)).toBe('en0 192.168.1.10');
    expect(describeSnapshot(change.after)).toBe('en5 10.0.0.7');

    vi.advanceTimersByTime(10_000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a short flap back to the original network', () => {
    watcher.start();
    current = OFFLINE;
    vi.advanceTimersByTime(2000);
    current = WIFI;
    vi.advanceTimersByTime(10_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restarts the debounce while the network keeps changing', () => {
    watcher.start();
    current = OFFLINE; // seen at 1 s
    vi.advanceTimersByTime(2000);
    current = ETHERNET; // seen at 3 s → reported at 6 s
    vi.advanceTimersByTime(2000);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(describeSnapshot(onChange.mock.calls[0]![0].before)).toBe('en0 192.168.1.10');
  });

  it('stops polling after stop()', () => {
    watcher.start();
    watcher.stop();
    current = ETHERNET;
    vi.advanceTimersByTime(10_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
