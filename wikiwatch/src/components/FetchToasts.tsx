import type { FetchToast } from "../live/fetchActivity";

// A toast starts fading out this long before it expires.
const LEAVE_MS = 500;

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
              {toast.result && <p className="toast-result">{toast.result}</p>}
            </li>
          );
        })}
    </ol>
  );
}
