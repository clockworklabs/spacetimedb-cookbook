import { byteDelta, WINDOW_MS, type ReplayEdit } from "../replay";
import { deltaClass } from "../format";

const WIDTH = 600;
const HEIGHT = 40;
const MIDLINE = HEIGHT / 2;

// One tick per edit across `spanMs` up to `clock` (by default, WINDOW_MS),
// oldest on the left. Additions rise above the line and removals drop below
// it, on a log scale so a one-word fix and a rewritten section are both
// visible.
export function EditTrail({
  edits,
  clock,
  spanMs = WINDOW_MS,
}: {
  edits: ReplayEdit[];
  clock: number;
  spanMs?: number;
}) {
  // Move the trail along one viewBox unit at a time. The clock changes far
  // more often than that, and following it exactly would shift every line of
  // every trail by an invisible fraction, so the browser would repaint every
  // trail on the page each time. Rounded up, so the newest edit never lands
  // beyond the right-hand edge.
  const stepMs = spanMs / WIDTH;
  const steppedClock = Math.ceil(clock / stepMs) * stepMs;

  return (
    <svg
      className="trail"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        className="trail-axis"
        x1={0}
        x2={WIDTH}
        y1={MIDLINE}
        y2={MIDLINE}
      />
      {edits.map(({ edit, key, revealAt }) => {
        const x = WIDTH * (1 - (steppedClock - revealAt) / spanMs);
        const bytes = byteDelta(edit);
        const scale = Math.min(1, Math.log10(1 + Math.abs(bytes)) / 4);
        const length = 3 + (MIDLINE - 3) * scale;
        const y2 = bytes < 0 ? MIDLINE + length : MIDLINE - length;
        const classes = ["tick", deltaClass(bytes), edit.isBot ? "bot" : ""];
        return (
          <line
            key={key}
            className={classes.join(" ")}
            x1={x}
            x2={x}
            y1={MIDLINE}
            y2={y2}
          />
        );
      })}
    </svg>
  );
}
