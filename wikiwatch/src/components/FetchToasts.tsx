import { Fragment, type ReactNode } from "react";
import type { FetchToast } from "../live/fetchActivity";
import type { PreviewPage } from "../module_bindings/types";
import { articleHref } from "../route";

// A toast starts fading out this long before it expires.
const LEAVE_MS = 500;
// How many titles a preview batch names before summarising the rest.
const TITLES_SHOWN = 2;

const VERBS: Record<FetchToast["state"], string> = {
  running: "Fetching",
  done: "Fetched",
  failed: "Couldn’t fetch",
};

const SUBJECTS: Record<FetchToast["fetcher"], string> = {
  edits: "recent changes",
  previews: "article previews",
};

export function FetchToasts({
  toasts,
  now,
}: {
  toasts: FetchToast[];
  now: number;
}) {
  return (
    // Deliberately not a live region: it changes every 15 seconds, which would
    // drown out everything else for a screen reader. StatusLine announces
    // when Wikipedia stops answering.
    <ol className="toasts" aria-label="Wikipedia fetches">
      {toasts
        .filter((toast) => toast.expiresAt > now)
        .map((toast) => {
          const leaving = toast.expiresAt - now <= LEAVE_MS;
          return (
            <li
              key={toast.id}
              className={`toast ${toast.state}${leaving ? " leaving" : ""}`}
            >
              <p className="toast-head">
                {VERBS[toast.state]} {SUBJECTS[toast.fetcher]}
              </p>
              {toast.subject && (
                <p className="toast-subject">{toast.subject}</p>
              )}
              {toast.pages && toast.pages.length > 0 && (
                <p className="toast-subject">
                  <PageList pages={toast.pages} />
                </p>
              )}
              {toast.result && <p className="toast-result">{toast.result}</p>}
            </li>
          );
        })}
    </ol>
  );
}

// "A, B and 3 more", with each title linked to its article's page.
function PageList({ pages }: { pages: PreviewPage[] }) {
  const shown =
    pages.length > TITLES_SHOWN + 1 ? pages.slice(0, TITLES_SHOWN) : pages;
  const items: ReactNode[] = shown.map(({ pageId, title }) => (
    <a href={articleHref(pageId)}>{title}</a>
  ));
  if (pages.length > shown.length) {
    items.push(`${pages.length - shown.length} more`);
  }

  return items.map((item, i) => (
    <Fragment key={i}>
      {i > 0 && (i === items.length - 1 ? " and " : ", ")}
      {item}
    </Fragment>
  ));
}
