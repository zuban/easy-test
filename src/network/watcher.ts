import { EventEmitter } from 'node:events';
import os from 'node:os';
import { takeSnapshot, type InterfaceMap, type NetworkSnapshot } from './snapshot.js';

export interface NetworkChange {
  readonly before: NetworkSnapshot;
  readonly after: NetworkSnapshot;
}

export interface NetworkWatcherOptions {
  readonly pollIntervalMs?: number;
  /** A new state must hold this long before it is reported (interfaces flap while switching). */
  readonly debounceMs?: number;
  readonly getInterfaces?: () => InterfaceMap;
}

/** What watch mode needs from a watcher — lets tests substitute a fake. */
export interface NetworkChangeSource {
  /** Starts watching and returns the network state taken as the baseline. */
  start(): NetworkSnapshot;
  stop(): void;
  on(event: 'change', listener: (change: NetworkChange) => void): unknown;
}

/**
 * Node has no "network changed" event, so we poll `os.networkInterfaces()`
 * (a cheap synchronous syscall) and compare order-independent snapshots.
 */
export class NetworkWatcher extends EventEmitter<{ change: [NetworkChange] }> implements NetworkChangeSource {
  readonly #pollIntervalMs: number;
  readonly #debounceMs: number;
  readonly #getInterfaces: () => InterfaceMap;

  #stable: NetworkSnapshot | undefined;
  #candidate: { snapshot: NetworkSnapshot; since: number } | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: NetworkWatcherOptions = {}) {
    super();
    this.#pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.#debounceMs = options.debounceMs ?? 3_000;
    this.#getInterfaces = options.getInterfaces ?? os.networkInterfaces;
  }

  start(): NetworkSnapshot {
    if (!this.#timer) {
      this.#stable = takeSnapshot(this.#getInterfaces());
      this.#candidate = undefined;
      this.#timer = setInterval(() => this.#poll(), this.#pollIntervalMs);
    }
    return this.#stable!;
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #poll(): void {
    const stable = this.#stable!;
    const now = takeSnapshot(this.#getInterfaces());

    if (now.key === stable.key) {
      // Back to where we were — it was just a flap.
      this.#candidate = undefined;
      return;
    }
    if (this.#candidate?.snapshot.key !== now.key) {
      // A new state appeared (or the previous candidate changed again): restart the debounce.
      this.#candidate = { snapshot: now, since: Date.now() };
    }
    if (Date.now() - this.#candidate.since >= this.#debounceMs) {
      this.#stable = now;
      this.#candidate = undefined;
      this.emit('change', { before: stable, after: now });
    }
  }
}
