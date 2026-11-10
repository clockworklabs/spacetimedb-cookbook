import { useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import { WeekCalendar } from "./WeekCalendar";
import { Schedule } from "./Schedule";
import { AdminGraph } from "./AdminGraph";
import "./App.css";

function App() {
  const { isActive: connected, identity } = useSpacetimeDB();
  const [users, ready] = useTable(tables.user);
  const [view, setView] = useState(location.hash.slice(1));

  const me = users.find((p) => identity && p.identity.isEqual(identity));
  const providers = users
    .filter((p) => p.service)
    .sort((a, b) => a.name.localeCompare(b.name));
  const views = me?.isAdmin
    ? ["week", "schedule", "admin"]
    : ["week", "schedule"];
  const current = views.includes(view) ? view : "week";

  return (
    <main className="desk">
      <svg
        className="stripes"
        viewBox="0 0 2400 174"
        preserveAspectRatio="xMaxYMin slice"
        aria-hidden="true"
      >
        <path stroke="var(--pink)" d="M0 144 H2250 L2335.4 -4" />
        <path stroke="var(--sun)" d="M0 152 H2254.6 L2344.6 -4" />
        <path stroke="var(--turquoise)" d="M0 160 H2259.2 L2353.9 -4" />
      </svg>

      <header className="navbar">
        <div className="navbar-inner">
          <strong className="brand">Gym bookings</strong>
          <nav className="views" aria-label="Pages">
            {views.map((v) => (
              <a
                key={v}
                href={`#${v}`}
                aria-current={v === current ? "page" : undefined}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </a>
            ))}
          </nav>
          {me && <span className="navbar-name">{me.name}</span>}
        </div>
      </header>

      {me ? (
        <>
          {current === "week" && (
            <WeekCalendar name={me.name} providers={providers} />
          )}
          {current === "schedule" && (
            <Schedule
              name={me.name}
              service={me.service ?? "Appointment"}
              tone={providers.indexOf(me)}
              users={users}
            />
          )}
          {current === "admin" && <AdminGraph />}
        </>
      ) : (
        ready && (
          <article className="sheet">
            <header className="sheet-head">
              <h1>No persona yet</h1>
            </header>
            <p>
              Send an admin your ID, shown below, and they can give you one.
            </p>
          </article>
        )
      )}

      <p className="status" aria-live="polite">
        {connected
          ? identity && (
              <>
                Your ID: <code>0x{identity.toHexString()}</code>
              </>
            )
          : "Reconnecting. Changes are paused until it's back."}
      </p>
    </main>
  );
}

export default App;
