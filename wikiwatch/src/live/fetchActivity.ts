import type { FetchLog } from "../module_bindings/types";
import { toMillis } from "./derive";
import { formatClock, plural } from "./format";

// Finished fetches stay up briefly; failures longer, so the error can be read.
const DONE_MS = 4_000;
const FAILED_MS = 10_000;
// Drops a fetch that never reports back, say because the module was
// republished mid-request.
const UNFINISHED_MS = 30_000;
const MAX_TOASTS = 4;
// How many titles a preview batch names before summarising the rest.
const TITLES_SHOWN = 2;

export type Fetcher = "edits" | "previews";

export type FetchToast = {
  id: string;
  fetcher: Fetcher;
  state: "running" | "done" | "failed";
  // What's being fetched. Missing if we connected after the fetch started.
  subject?: string;
  result?: string;
  expiresAt: number;
};

// Folds one fetch_log event into the toasts, dropping any that have expired.
// A fetch's end event updates its start's toast in place.
export function applyFetchLog(
  toasts: FetchToast[],
  row: FetchLog,
  now: number,
): FetchToast[] {
  const live = toasts.filter((toast) => toast.expiresAt > now);
  const id = row.fetchId.toString();
  const started = live.find((toast) => toast.id === id);
  const next = toToast(id, row.activity, started, now);
  return started
    ? live.map((toast) => (toast.id === id ? next : toast))
    : [...live, next].slice(-MAX_TOASTS);
}

function toToast(
  id: string,
  activity: FetchLog["activity"],
  started: FetchToast | undefined,
  now: number,
): FetchToast {
  const start = (fetcher: Fetcher, subject: string): FetchToast => ({
    id,
    fetcher,
    state: "running",
    subject,
    expiresAt: now + UNFINISHED_MS,
  });
  const settle = (
    fetcher: Fetcher,
    failed: boolean,
    result: string,
  ): FetchToast => ({
    id,
    fetcher,
    state: failed ? "failed" : "done",
    subject: started?.subject,
    result,
    expiresAt: now + (failed ? FAILED_MS : DONE_MS),
  });

  switch (activity.tag) {
    case "FetchingEdits":
      return start(
        "edits",
        `Changes since ${formatClock(toMillis(activity.value.since))}`,
      );
    case "FetchedEdits": {
      const { received, added } = activity.value;
      return settle(
        "edits",
        false,
        `${plural(received, "change")}, ${added} new`,
      );
    }
    case "EditsFailed":
      return settle("edits", true, activity.value);
    case "FetchingPreviews":
      return start("previews", summariseTitles(activity.value.titles));
    case "FetchedPreviews": {
      const { stored, missing } = activity.value;
      const result = `${plural(stored, "preview")} stored`;
      return settle(
        "previews",
        false,
        missing > 0 ? `${result}, ${missing} missing` : result,
      );
    }
    case "PreviewsFailed":
      return settle("previews", true, activity.value);
  }
}

function summariseTitles(titles: string[]): string {
  if (titles.length > TITLES_SHOWN + 1) {
    const rest = titles.length - TITLES_SHOWN;
    return `${titles.slice(0, TITLES_SHOWN).join(", ")} and ${rest} more`;
  }
  if (titles.length <= 1) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}
