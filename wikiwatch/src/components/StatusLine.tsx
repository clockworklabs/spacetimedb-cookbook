import { useEffect, useRef } from "react";
import type { PollerStatus } from "../module_bindings/types";
import { REPLAY_DELAY_MS, toMillis } from "../live/derive";
import { formatClock } from "../live/format";

// The server polls every 15 seconds; this long without success means trouble.
const STALE_AFTER_MS = 2 * 60_000;

type Props = {
  isActive: boolean;
  loaded: boolean;
  status: PollerStatus | undefined;
  now: number;
};

export function StatusLine({ isActive, loaded, status, now }: Props) {
  const wasActive = useRef(false);
  useEffect(() => {
    if (isActive) wasActive.current = true;
  }, [isActive]);

  const [text, problem] = describe(
    { isActive, loaded, status, now },
    wasActive.current,
  );
  return (
    <p className={problem ? "status problem" : "status"} role="status">
      {text}
    </p>
  );
}

function describe(
  { isActive, loaded, status, now }: Props,
  wasActive: boolean,
): [string, boolean] {
  if (!isActive) {
    return wasActive
      ? [
          "Lost the connection to the wikiwatch server. Reload the page to reconnect.",
          true,
        ]
      : ["Connecting to the wikiwatch server…", false];
  }
  if (!loaded || !status) {
    return ["Loading the last hour of edits…", false];
  }
  if (!status.lastSuccessAt) {
    return [
      "Waiting for the server’s first batch of edits from Wikipedia.",
      false,
    ];
  }
  const lastSuccess = toMillis(status.lastSuccessAt);
  if (status.consecutiveFailures > 0 || now - lastSuccess > STALE_AFTER_MS) {
    return [
      `Wikipedia hasn’t answered since ${formatClock(lastSuccess)}. Showing the edits collected until then.`,
      true,
    ];
  }
  return [
    `Live. Edits play back ${REPLAY_DELAY_MS / 1000} seconds after they’re made, at the pace they happened.`,
    false,
  ];
}
