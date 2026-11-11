import { useState } from "react";
import { Timestamp } from "spacetimedb";
import { tables, reducers } from "./module_bindings";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import type { AppointmentDetail as Appointment } from "./module_bindings/types";
import { formatDate, startOfToday } from "./dates";
import { useErrorBanner } from "./useErrorBanner";

const byDate = (appointments: readonly Appointment[]) => {
  const days = new Map<string, Appointment[]>();
  const inOrder = [...appointments].sort(
    (a, b) => a.startsAt.toDate().getTime() - b.startsAt.toDate().getTime(),
  );
  for (const appointment of inOrder) {
    const date = formatDate(appointment.startsAt.toDate(), {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    days.set(date, [...(days.get(date) ?? []), appointment]);
  }
  return [...days];
};

export function Schedule({ name, tone }: { name: string; tone: number }) {
  const [today] = useState(startOfToday);

  const [appointments, ready] = useTable(
    tables.myAppointments.where((a) =>
      a.startsAt.gte(Timestamp.fromDate(today)),
    ),
  );
  const deleteAppointment = useReducer(reducers.deleteAppointment);
  const [error, withErrorBanner] = useErrorBanner();
  const { identity } = useSpacetimeDB();

  // Providers can take classes too, so a line is either someone coming to
  // see us, or us going to see someone else.
  const describe = (a: Appointment) => {
    const service = a.service ?? "Appointment";
    return identity && a.provider.isEqual(identity)
      ? `${a.clientName}: ${service}`
      : `${service} with ${a.providerName}`;
  };

  return (
    <article className={`sheet tone-${tone}`} aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">{name}'s appointments</h1>
      </header>

      <div className="lines">
        {byDate(appointments).map(([date, booked]) => (
          <section key={date}>
            <h2 className="line day-heading">
              <span className="line-text">{date}</span>
            </h2>
            <ol className="day-lines">
              {booked.map((a) => (
                <li key={a.id} className="line tab just-written">
                  <span className="margin-time">
                    {formatDate(a.startsAt.toDate(), {
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    })}
                  </span>
                  <span className="line-text">{describe(a)}</span>
                  <button
                    type="button"
                    className="erase"
                    onClick={() =>
                      withErrorBanner(deleteAppointment({ id: a.id }))
                    }
                    aria-label={`Cancel ${describe(a)}`}
                    title="Cancel appointment"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4 L12 12 M12 4 L4 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {ready && appointments.length === 0 && (
          <div className="line">
            <span className="line-text line-empty">Nothing booked yet</span>
          </div>
        )}
        {error && (
          <div className="line line-error" role="alert">
            <span className="line-text">Couldn't save that: {error}</span>
          </div>
        )}
      </div>
    </article>
  );
}
