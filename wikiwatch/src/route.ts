import { useSyncExternalStore } from "react";

// Routes live in the URL's fragment, so any static host can serve the app
// without rewriting unknown paths to index.html.
export type Route =
  | { page: "front" }
  | { page: "edits" }
  | { page: "arguments" }
  | { page: "article"; pageId: bigint };

export const FRONT_PAGE_HREF = "#/";

export function articleHref(pageId: bigint): string {
  return `#/article/${pageId}`;
}

function parseRoute(hash: string): Route {
  // Neither is linked from anywhere: you have to know they're there.
  if (hash === "#/edits") return { page: "edits" };
  if (hash === "#/arguments") return { page: "arguments" };
  const match = hash.match(/^#\/article\/(\d+)$/);
  return match
    ? { page: "article", pageId: BigInt(match[1]) }
    : { page: "front" };
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  return parseRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
}
