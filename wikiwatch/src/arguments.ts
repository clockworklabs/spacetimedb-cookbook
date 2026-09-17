import type { Edit } from "./module_bindings/types";
import { toMillis } from "./replay";

// A side has to revert at least this often to count as arguing, which leaves
// out a patroller reverting a vandal who never reverts back. The server
// decides which pages are arguments by the same number
// (MIN_REVERTS_PER_SIDE in spacetimedb/src/arguments.ts), so the two have to
// change together; this copy tells the two sides from everyone else.
const MIN_REVERTS_PER_SIDE = 2;

export type Revert = { edit: Edit; at: number };

export type Side = { userName: string; reverts: number };

export type Argument = {
  pageId: bigint;
  // The title of the latest revert.
  title: string;
  // Most reverts first.
  sides: Side[];
  // Every revert on the page, bots and one-off reverters included. Oldest first.
  reverts: Revert[];
  lastRevertAt: number;
};

// Pages where at least two editors, not bots, have each reverted the page
// repeatedly, from a set of reverts. Most recently fought over first.
//
// The server has already kept only the reverts of pages that qualify, so this
// groups a few hundred rows rather than a few thousand. The work that's left is
// naming the two sides, which the rally needs anyway; the test that there are
// two of them is then a safety net, for a database whose flags predate the
// column or the current threshold (see remarkArguments).
export function findArguments(reverts: Iterable<Edit>): Argument[] {
  const byPage = new Map<string, Revert[]>();
  for (const edit of reverts) {
    const revert = { edit, at: toMillis(edit.editedAt) };
    const key = edit.pageId.toString();
    const group = byPage.get(key);
    if (group) group.push(revert);
    else byPage.set(key, [revert]);
  }

  const found: Argument[] = [];
  for (const reverts of byPage.values()) {
    const counts = new Map<string, number>();
    for (const { edit } of reverts) {
      if (edit.isBot || !edit.userName) continue;
      counts.set(edit.userName, (counts.get(edit.userName) ?? 0) + 1);
    }
    const sides = [...counts]
      .filter(([, count]) => count >= MIN_REVERTS_PER_SIDE)
      .map(([userName, count]) => ({ userName, reverts: count }))
      .sort((a, b) => b.reverts - a.reverts);
    if (sides.length < 2) continue;

    reverts.sort((a, b) => a.at - b.at);
    const last = reverts[reverts.length - 1];
    found.push({
      pageId: last.edit.pageId,
      title: last.edit.title,
      sides,
      reverts,
      lastRevertAt: last.at,
    });
  }
  return found.sort((a, b) => b.lastRevertAt - a.lastRevertAt);
}
