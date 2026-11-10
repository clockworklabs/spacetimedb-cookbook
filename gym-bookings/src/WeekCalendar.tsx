import { useState } from "react";
import { Timestamp } from "spacetimedb";
import { tables, reducers } from "./module_bindings";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import type { Appointment, Person } from "./module_bindings/types";
import {
  HOURS,
  addDays,
  at,
  formatDate,
  isAt,
  startOfToday,
  startOfWeek,
} from "./dates";
import { useErrorBanner } from "./useErrorBanner";

export function WeekCalendar({
  name: clientName,
  providers,
}: {
  name: string;
  providers: Person[];
}) {
  const [monday, setMonday] = useState(() => startOfWeek(startOfToday()));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const { isActive: connected } = useSpacetimeDB();
  const [appointments, ready] = useTable(
    tables.myBookings
      .where((a) => a.startsAt.gte(Timestamp.fromDate(monday)))
      .where((a) => a.startsAt.lt(Timestamp.fromDate(addDays(monday, 7)))),
  );
  const bookAppointment = useReducer(reducers.bookAppointment);
  const rescheduleAppointment = useReducer(reducers.rescheduleAppointment);
  const cancelAppointment = useReducer(reducers.cancelAppointment);

  const [error, withErrorBanner] = useErrorBanner();
  const [chosenProvider, setChosenProvider] = useState<string | null>(null);
  const [moving, setMoving] = useState<Appointment | null>(null);

  const providerFor = (appointment: Appointment) =>
    providers.find((p) => p.identity.isEqual(appointment.provider));
  const selected =
    providers.find((p) => p.identity.toHexString() === chosenProvider) ??
    providers[0];

  const fillSlot = (when: Date) => {
    const startsAt = Timestamp.fromDate(when);
    if (moving) {
      withErrorBanner(rescheduleAppointment({ id: moving.id, startsAt }));
      setMoving(null);
    } else if (selected) {
      withErrorBanner(
        bookAppointment({ provider: selected.identity, startsAt }),
      );
    }
  };

  return (
    <article className="sheet" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">{clientName}'s week</h1>
        <PageTurner
          label={formatDate(monday, { day: "numeric", month: "long" })}
          onBack={() => setMonday(addDays(monday, -7))}
          onForward={() => setMonday(addDays(monday, 7))}
        />
      </header>

      <div className="booking-bar" role="radiogroup" aria-label="Book with">
        {providers.map((p) => (
          <label
            key={p.identity.toHexString()}
            className={`choice tone-${providers.indexOf(p)}`}
          >
            <input
              type="radio"
              name="provider"
              checked={p === selected}
              onChange={() => setChosenProvider(p.identity.toHexString())}
            />
            <span>
              {p.service} with {p.name}
            </span>
          </label>
        ))}
        <span className="hint" aria-live="polite">
          {error ? (
            <span className="error" role="alert">
              Couldn't save that: {error}
            </span>
          ) : moving ? (
            "Pick a new slot, or click it again to stay put."
          ) : providers.length === 0 ? (
            "Nobody's taking bookings yet. An admin can give someone a service."
          ) : (
            "Click a slot to book it."
          )}
        </span>
      </div>

      <div className="week-scroll">
        <table className="week">
          <thead>
            <tr>
              <td />
              {days.map((day) => (
                <th key={day.getTime()} scope="col">
                  {formatDate(day, { weekday: "short", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => (
              <tr key={hour}>
                <th scope="row">{hour}:00</th>
                {days.map((day) => {
                  const when = at(day, hour);
                  const booked = appointments.find((a) =>
                    isAt(a.startsAt, when),
                  );
                  return (
                    <td key={day.getTime()}>
                      {booked ? (
                        <Booked
                          service={providerFor(booked)?.service}
                          name={providerFor(booked)?.name}
                          tone={providers.indexOf(providerFor(booked)!)}
                          isMoving={moving?.id === booked.id}
                          onMove={() =>
                            setMoving(moving?.id === booked.id ? null : booked)
                          }
                          onCancel={() =>
                            withErrorBanner(
                              cancelAppointment({ id: booked.id }),
                            )
                          }
                        />
                      ) : (
                        <button
                          type="button"
                          className="slot"
                          disabled={
                            !connected || !ready || (!moving && !selected)
                          }
                          onClick={() => fillSlot(when)}
                          aria-label={`${moving ? "Move here" : "Book"}: ${formatDate(day, { weekday: "long" })} at ${hour}:00`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Booked({
  service,
  name,
  tone,
  isMoving,
  onMove,
  onCancel,
}: {
  service?: string;
  name?: string;
  tone: number;
  isMoving: boolean;
  onMove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`booked tone-${tone}${isMoving ? " is-moving" : ""}`}>
      <button
        type="button"
        className="booked-move"
        onClick={onMove}
        aria-pressed={isMoving}
        title="Move this appointment"
      >
        <strong>{service}</strong>
        <span>{name}</span>
      </button>
      <button
        type="button"
        className="erase"
        onClick={onCancel}
        aria-label={`Cancel ${service} with ${name}`}
        title="Cancel appointment"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4 L12 12 M12 4 L4 12" />
        </svg>
      </button>
    </div>
  );
}

function PageTurner({
  label,
  onBack,
  onForward,
}: {
  label: string;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <nav className="turner">
      <button type="button" onClick={onBack} aria-label="Earlier">
        ‹
      </button>
      <span>{label}</span>
      <button type="button" onClick={onForward} aria-label="Later">
        ›
      </button>
    </nav>
  );
}
