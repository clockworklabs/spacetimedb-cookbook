import { useEffect, useState } from "react";
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
  const viewLabel = capitalise(current);

  useEffect(() => {
    document.title = ["Gym", me?.name, viewLabel].filter(Boolean).join(" - ");
  }, [me?.name, viewLabel]);

  return (
    <main className="desk">
      <svg
        className="ridges"
        viewBox="0 0 2400 260"
        preserveAspectRatio="xMaxYMin slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="mist-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--quartzite)" />
            <stop offset="0.85" stopColor="var(--quartzite)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mist-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--eucalyptus)" stopOpacity="0.7" />
            <stop offset="0.8" stopColor="var(--eucalyptus)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          fill="url(#mist-far)"
          d="M1420 260 L1580 150 L1650 170 L1790 82 L1870 128 L1930 110 L2070 52 L2170 118 L2250 98 L2400 160 V260 Z"
        />
        <path
          fill="url(#mist-near)"
          d="M1600 260 L1760 168 L1830 186 L1980 112 L2050 146 L2130 128 L2270 182 L2400 140 V260 Z"
        />
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
                {capitalise(v)}
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

function capitalise(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

export default App;
