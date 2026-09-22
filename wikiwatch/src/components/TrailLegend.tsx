// What a trail's ticks mean, drawn with the ticks themselves.
export function TrailLegend() {
  return (
    <p className="legend">
      <span>
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          <line className="trail-axis" x1="1" x2="9" y1="10" y2="10" />
          <line className="tick added" x1="5" x2="5" y1="10" y2="1" />
        </svg>
        added
      </span>
      <span>
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          <line className="trail-axis" x1="1" x2="9" y1="4" y2="4" />
          <line className="tick removed" x1="5" x2="5" y1="4" y2="13" />
        </svg>
        removed
      </span>
    </p>
  );
}
