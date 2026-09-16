import type { Edit } from "./module_bindings/types";
import { toMillis } from "./replay";

// MediaWiki tags an edit that undoes earlier edits when it's saved. (It also
// tags the undone edit `mw-reverted`, but only later, after we've fetched it.)
const REVERT_TAGS = new Set(["mw-undo", "mw-rollback", "mw-manual-revert"]);

// A side has to revert at least this often to count as arguing, which leaves
// out a patroller reverting a vandal who never reverts back.
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

export function isRevert(edit: Edit): boolean {
  return edit.tags.some((tag) => REVERT_TAGS.has(tag));
}

// Pages where at least two editors, not bots, have each reverted the page
// repeatedly. Most recently fought over first.
export function findArguments(edits: Iterable<Edit>): Argument[] {
  const byPage = new Map<string, Revert[]>();
  for (const edit of edits) {
    if (!isRevert(edit)) continue;
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
