import { useSpacetimeDB } from "spacetimedb/react";
import { WeekCalendar } from "./WeekCalendar";
import { Schedule } from "./Schedule";
import { AdminGraph } from "./AdminGraph";
import "./App.css";

function Page({ person }: { person: string | null }) {
  switch (person) {
    case "kris":
      return <WeekCalendar clientName="Kris" />;
    case "alice":
      return <Schedule name="Alice" service="Gym class" tone={0} />;
    case "bob":
      return <Schedule name="Bob" service="Piano lesson" tone={1} />;
    case "admin":
      return <AdminGraph />;
    default:
      return <PickPerson />;
  }
}

function PickPerson() {
  return (
    <article className="sheet">
      <header className="sheet-head">
        <h1>Who are you?</h1>
      </header>
      <ul className="lines people">
        <PersonLine as="kris" label="Kris, booking the week" />
        <PersonLine as="alice" label="Alice, who teaches gym classes" />
        <PersonLine as="bob" label="Bob, who teaches piano" />
        <PersonLine as="admin" label="The admin, watching the numbers" />
      </ul>
    </article>
  );
}

function PersonLine({ as, label }: { as: string; label: string }) {
  return (
    <li className="line">
      <a className="line-text" href={`?as=${as}`} target="_blank">
        {label}
      </a>
    </li>
  );
}

function App({ person }: { person: string | null }) {
  const { isActive: connected } = useSpacetimeDB();

  return (
    <main className="desk">
      <svg
        className="stripes"
        viewBox="0 0 2400 130"
        preserveAspectRatio="xMaxYMin slice"
        aria-hidden="true"
      >
        <path stroke="var(--pink)" d="M0 100 H2250 L2310 -4" />
        <path stroke="var(--sun)" d="M0 108 H2254.6 L2319.3 -4" />
        <path stroke="var(--turquoise)" d="M0 116 H2259.2 L2328.5 -4" />
      </svg>

      <Page person={person} />

      <p className="status" aria-live="polite">
        {!connected && "Reconnecting. Changes are paused until it's back."}
      </p>
    </main>
  );
}

export default App;
