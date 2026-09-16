import type { Edit } from "./module_bindings/types";

const WIKIPEDIA = "https://en.wikipedia.org";

export function articleUrl(pageId: bigint): string {
  return `${WIKIPEDIA}/?curid=${pageId}`;
}

export function historyUrl(pageId: bigint): string {
  return `${WIKIPEDIA}/w/index.php?curid=${pageId}&action=history`;
}

export function contributionsUrl(userName: string): string {
  return `${WIKIPEDIA}/wiki/Special:Contributions/${encodeURIComponent(userName)}`;
}

export function diffUrl(edit: Edit): string {
  return edit.oldRevId === 0n
    ? `${WIKIPEDIA}/w/index.php?oldid=${edit.revId}`
    : `${WIKIPEDIA}/w/index.php?diff=${edit.revId}&oldid=${edit.oldRevId}`;
}
