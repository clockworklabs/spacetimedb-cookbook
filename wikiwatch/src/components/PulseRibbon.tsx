const BAR = 4;
const GAP = 2;
const HEIGHT = 28;

// Edits per minute, one bar for each entry in `counts`. `counts` ends with the
// minute in progress, which is drawn in the highlight colour.
export function PulseRibbon({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const completed = counts.slice(-6, -1);
  const rate = Math.round(
    completed.reduce((sum, n) => sum + n, 0) / Math.max(1, completed.length),
  );
  const width = counts.length * (BAR + GAP) - GAP;

  return (
    <figure className="pulse">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Edits per minute over the last ${counts.length} minutes. About ${rate} a minute recently.`}
      >
        {counts.map((count, i) => {
          const height = count === 0 ? 0 : Math.max(1, (count / max) * HEIGHT);
          return (
            <rect
              key={i}
              className={i === counts.length - 1 ? "bar current" : "bar"}
              x={i * (BAR + GAP)}
              y={HEIGHT - height}
              width={BAR}
              height={height}
            />
          );
        })}
      </svg>
      <figcaption>
        <strong>{rate}</strong> edits/min
      </figcaption>
    </figure>
  );
}
