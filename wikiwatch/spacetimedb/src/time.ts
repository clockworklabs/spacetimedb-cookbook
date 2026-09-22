// Timestamp arithmetic. Durations are in microseconds, as Timestamp stores them.

import { Timestamp } from "spacetimedb";

export const SECOND = 1_000_000n;
export const MINUTE = 60n * SECOND;
export const HOUR = 60n * MINUTE;

export function minus(ts: Timestamp, micros: bigint): Timestamp {
  return new Timestamp(ts.microsSinceUnixEpoch - micros);
}

export function compare(a: Timestamp, b: Timestamp): number {
  const d = a.microsSinceUnixEpoch - b.microsSinceUnixEpoch;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

export function later(a: Timestamp, b: Timestamp): Timestamp {
  return compare(a, b) >= 0 ? a : b;
}
