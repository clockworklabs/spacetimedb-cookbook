import { Timestamp } from "spacetimedb";
import { tables } from "./module_bindings";
import { useTable } from "spacetimedb/react";
import { formatDate } from "./dates";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const FIRST_MONDAY = 4 * DAY; // Matches the module's weeks, which run Monday to Sunday in UTC.

const toMillis = (t: Timestamp) => Number(t.microsSinceUnixEpoch / 1000n);

export function AdminGraph() {
  const [totals] = useTable(tables.sessionsPerWeek);

  const sessionsIn = new Map(
    totals.map((row) => [toMillis(row.weekStart), row.sessions]),
  );

  // Always show a stretch around today, and any week with sessions outside it.
  const now = Date.now();
  const thisWeek = now - ((now - FIRST_MONDAY) % WEEK);
  const first = Math.min(thisWeek - 2 * WEEK, ...sessionsIn.keys());
  const last = Math.max(thisWeek + 5 * WEEK, ...sessionsIn.keys());
  const weeks = Array.from(
    { length: (last - first) / WEEK + 1 },
    (_, i) => first + i * WEEK,
  );

  const total = totals.reduce((sum, row) => sum + row.sessions, 0);
  const top = Math.max(4, ...totals.map((row) => row.sessions));
  const step = Math.ceil(top / 4);
  const ceiling = step * 4;

  return (
    <article className="sheet" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">Sessions booked per week</h1>
        <div className="sheet-meta">
          <span className="total">{total}</span>
          <span>in the book</span>
        </div>
      </header>

      <div className="graph">
        <div className="gridlines" aria-hidden="true">
          {[4, 3, 2, 1, 0].map((n) => (
            <span key={n}>{n * step}</span>
          ))}
        </div>
        <ol className="bars">
          {weeks.map((week) => {
            const sessions = sessionsIn.get(week) ?? 0;
            const label = formatDate(new Date(week), {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            });
            return (
              <li
                key={week}
                className={week === thisWeek ? "is-this-week" : undefined}
                title={`Week of ${label}: ${sessions} sessions`}
              >
                <div className="bar-track">
                  <div
                    className="bar"
                    style={{ height: `${(sessions / ceiling) * 100}%` }}
                  >
                    {sessions > 0 && (
                      <span className="bar-value">{sessions}</span>
                    )}
                  </div>
                </div>
                <span className="bar-label">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}
