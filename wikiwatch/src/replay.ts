import type { Timestamp } from "spacetimedb";
import type { Edit } from "./module_bindings/types";

// The server fetches edits from Wikipedia every 15 seconds, and Wikipedia's API trails its
// own edits by a few more. Replaying this far behind real time turns those
// bursts back into a steady stream, with each edit at its real moment.
export const REPLAY_DELAY_MS = 30_000;

// How much history the display works with: as long as the server keeps an
// edit live (LIVE_FOR in the module).
export const WINDOW_MS = 15 * 60_000;

// An edit's contribution to an article's heat halves every ten minutes.
const HEAT_HALF_LIFE_MS = 10 * 60_000;

const MINUTE_MS = 60_000;

export type ReplayEdit = {
  edit: Edit;
  key: string;
  // When the edit was made, and when the display should show it.
  at: number;
  revealAt: number;
};

export type Replay = {
  // Every edit, ordered by revealAt.
  all: ReplayEdit[];
  // The same edits grouped by page id, each group ordered by revealAt.
  byPage: Map<string, ReplayEdit[]>;
};

export type ArticleRank = { key: string; heat: number };

export function toMillis(ts: Timestamp): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

// Wikipedia timestamps are whole seconds, so a busy second's edits would all
// land at once. Spread each second's edits evenly across it instead.
export function scheduleReplay(edits: Iterable<Edit>): Replay {
  const all = [...edits]
    .map((edit) => {
      const at = toMillis(edit.editedAt);
      return { edit, key: edit.rcId.toString(), at, revealAt: at };
    })
    .sort((a, b) => a.at - b.at || compareBigInt(a.edit.rcId, b.edit.rcId));

  for (let start = 0; start < all.length; ) {
    let end = start;
    while (end < all.length && all[end].at === all[start].at) end++;
    const spacing = 1000 / (end - start);
    for (let i = start; i < end; i++) {
      all[i].revealAt = all[i].at + (i - start) * spacing;
    }
    start = end;
  }

  const byPage = new Map<string, ReplayEdit[]>();
  for (const replayEdit of all) {
    const key = replayEdit.edit.pageId.toString();
    const group = byPage.get(key);
    if (group) group.push(replayEdit);
    else byPage.set(key, [replayEdit]);
  }
  return { all, byPage };
}

// How many of `edits` (ordered by revealAt) the display has reached.
export function revealedCount(edits: ReplayEdit[], clock: number): number {
  let low = 0;
  let high = edits.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (edits[mid].revealAt <= clock) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function heatOf(edits: ReplayEdit[], clock: number): number {
  return edits.reduce(
    (heat, { revealAt }) =>
      heat + Math.pow(0.5, (clock - revealAt) / HEAT_HALF_LIFE_MS),
    0,
  );
}

// The hottest articles among the first `revealed` edits in the window.
// Redirects are left out: they have no content worth previewing.
export function rankArticles(
  edits: ReplayEdit[],
  revealed: number,
  clock: number,
  limit: number,
): ArticleRank[] {
  const byPage = new Map<string, ReplayEdit[]>();
  for (let i = revealed - 1; i >= 0 && edits[i].at >= clock - WINDOW_MS; i--) {
    if (edits[i].edit.isRedirect) continue;
    const key = edits[i].edit.pageId.toString();
    const group = byPage.get(key);
    if (group) group.push(edits[i]);
    else byPage.set(key, [edits[i]]);
  }
  return [...byPage]
    .map(([key, group]) => ({ key, heat: heatOf(group, clock) }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit);
}

// Edit counts per clock minute, oldest first. The last entry is the minute
// in progress.
export function editsPerMinute(
  edits: ReplayEdit[],
  revealed: number,
  clock: number,
  minutes: number,
): number[] {
  const counts = new Array<number>(minutes).fill(0);
  const currentMinute = Math.floor(clock / MINUTE_MS);
  for (let i = revealed - 1; i >= 0; i--) {
    const minute = Math.floor(edits[i].revealAt / MINUTE_MS);
    const index = minutes - 1 - (currentMinute - minute);
    if (index < 0) break;
    counts[index]++;
  }
  return counts;
}

export function byteDelta(edit: Edit): number {
  return edit.newLen - edit.oldLen;
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
