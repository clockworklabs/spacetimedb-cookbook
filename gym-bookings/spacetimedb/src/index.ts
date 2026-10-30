import { Timestamp } from "spacetimedb";
import { schema, table, t, SenderError } from "spacetimedb/server";

// STORE
const appointment = table(
  { name: "appointment" },
  {
    id: t.u64().primaryKey().autoInc(),
    client: t.identity().index("btree"),
    clientName: t.string(),
    provider: t.identity().index("btree"),
    startsAt: t.timestamp(),
  },
);

const provider = table(
  { name: "provider", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    service: t.string(),
  },
);

const spacetimedb = schema({ appointment, provider });
export default spacetimedb;

// CREATE
export const offerService = spacetimedb.reducer(
  { name: t.string(), service: t.string() },
  (ctx, { name, service }) => {
    if (ctx.db.provider.identity.find(ctx.sender)) {
      ctx.db.provider.identity.update({ identity: ctx.sender, name, service });
    } else {
      ctx.db.provider.insert({ identity: ctx.sender, name, service });
    }
  },
);

export const bookAppointment = spacetimedb.reducer(
  { provider: t.identity(), clientName: t.string(), startsAt: t.timestamp() },
  (ctx, { provider, clientName, startsAt }) => {
    if (!ctx.db.provider.identity.find(provider)) {
      throw new SenderError("Provider not found");
    }
    for (const booked of ctx.db.appointment.provider.filter(provider)) {
      if (booked.startsAt.toMillis() === startsAt.toMillis()) {
        throw new SenderError("That slot has just been taken");
      }
    }

    ctx.db.appointment.insert({
      id: 0n,
      client: ctx.sender,
      clientName,
      provider,
      startsAt,
    });
  },
);

// RETRIEVE: three views of the one table.
export const myCalendar = spacetimedb.view(
  { name: "my_calendar", public: true },
  t.array(appointment.rowType),
  (ctx) => ctx.from.appointment.where((a) => a.client.eq(ctx.sender)),
);

export const mySchedule = spacetimedb.view(
  { name: "my_schedule", public: true },
  t.array(appointment.rowType),
  (ctx) => ctx.from.appointment.where((a) => a.provider.eq(ctx.sender)),
);

const WeekTotal = t.row("WeekTotal", {
  weekStart: t.timestamp().primaryKey(),
  sessions: t.u32(),
});

const DAY = 86_400_000_000n;
const FIRST_MONDAY = 4n * DAY; // 5 January 1970, the first Monday after the epoch.

export const sessionsPerWeek = spacetimedb.anonymousView(
  { name: "sessions_per_week", public: true },
  t.array(WeekTotal),
  (ctx) => {
    const totals = new Map<bigint, number>();
    for (const { startsAt } of ctx.db.appointment.iter()) {
      const micros = startsAt.microsSinceUnixEpoch;
      const week = micros - ((micros - FIRST_MONDAY) % (7n * DAY));
      totals.set(week, (totals.get(week) ?? 0) + 1);
    }
    return [...totals].map(([week, sessions]) => ({
      weekStart: new Timestamp(week),
      sessions,
    }));
  },
);

// UPDATE
export const rescheduleAppointment = spacetimedb.reducer(
  { id: t.u64(), startsAt: t.timestamp() },
  (ctx, { id, startsAt }) => {
    const existing = ctx.db.appointment.id.find(id);
    if (!existing || !existing.client.equals(ctx.sender)) {
      throw new SenderError("Appointment not found");
    }
    for (const booked of ctx.db.appointment.provider.filter(
      existing.provider,
    )) {
      if (booked.startsAt.toMillis() === startsAt.toMillis()) {
        throw new SenderError("That slot has just been taken");
      }
    }
    ctx.db.appointment.id.update({ ...existing, startsAt });
  },
);

// DELETE
export const cancelAppointment = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    const existing = ctx.db.appointment.id.find(id);
    if (
      !existing ||
      !(
        existing.client.equals(ctx.sender) ||
        existing.provider.equals(ctx.sender)
      )
    ) {
      throw new SenderError("Appointment not found");
    }
    ctx.db.appointment.id.delete(id);
  },
);
