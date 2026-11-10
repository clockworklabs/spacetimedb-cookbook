import { Timestamp } from "spacetimedb";
import { schema, table, t, SenderError } from "spacetimedb/server";

////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////
const DAY = 86_400_000_000n;
const FIRST_MONDAY = 4n * DAY; // 5 January 1970, the first Monday after the epoch.

////////////////////////////////////////////////////////////
// STORAGE (Tables)
////////////////////////////////////////////////////////////
const user = table(
  { name: "user", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    service: t.option(t.string()),
    isAdmin: t.bool(),
  },
);

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

const spacetimedb = schema({ user, appointment });
export default spacetimedb;

// When the database is created, we register the creating user as an admin.
// (For a production environment you might want to set it to a known ID.
// Probably the one shown by `spacetime login show`.)
export const init = spacetimedb.init((ctx) => {
  ctx.db.user.insert({
    identity: ctx.sender,
    name: "Owner",
    service: undefined,
    isAdmin: true,
  });
});

////////////////////////////////////////////////////////////
// CREATE
////////////////////////////////////////////////////////////
export const bookAppointment = spacetimedb.reducer(
  { provider: t.identity(), startsAt: t.timestamp() },
  (ctx, { provider, startsAt }) => {
    const client = ctx.db.user.identity.find(ctx.sender);
    if (!client) {
      throw new SenderError("You don't have an account yet");
    }
    if (!ctx.db.user.identity.find(provider)?.service) {
      throw new SenderError("Provider not found");
    }
    for (const booked of ctx.db.appointment.provider.filter(provider)) {
      if (booked.startsAt.toMillis() === startsAt.toMillis()) {
        throw new SenderError("That slot has been taken");
      }
    }

    ctx.db.appointment.insert({
      id: 0n,
      client: ctx.sender,
      clientName: client.name,
      provider,
      startsAt,
    });
  },
);

////////////////////////////////////////////////////////////
// RETRIEVE: Three diffferent views. Three ways of looking at one table.
////////////////////////////////////////////////////////////
export const myBookings = spacetimedb.view(
  { name: "my_bookings", public: true },
  t.array(appointment.rowType),
  (ctx) =>
    ctx.from.appointment.where((appointment) =>
      appointment.client.eq(ctx.sender),
    ),
);

export const myWorkSchedule = spacetimedb.view(
  { name: "my_work_schedule", public: true },
  t.array(appointment.rowType),
  (ctx) =>
    ctx.from.appointment.where((appointment) =>
      appointment.provider.eq(ctx.sender),
    ),
);

const WeekTotal = t.row("WeekTotal", {
  weekStart: t.timestamp().primaryKey(),
  sessions: t.u32(),
});

export const sessionsPerWeek = spacetimedb.view(
  { name: "sessions_per_week", public: true },
  t.array(WeekTotal),
  (ctx) => {
    if (!ctx.db.user.identity.find(ctx.sender)?.isAdmin) {
      return [];
    }
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

////////////////////////////////////////////////////////////
// UPDATE
////////////////////////////////////////////////////////////
export const rescheduleAppointment = spacetimedb.reducer(
  { id: t.u64(), startsAt: t.timestamp() },
  (ctx, { id, startsAt }) => {
    const existing = ctx.db.appointment.id.find(id);
    if (!existing || !ctx.sender.equals(existing.client)) {
      throw new SenderError("Appointment not found");
    }
    for (const booked of ctx.db.appointment.provider.filter(
      existing.provider,
    )) {
      if (booked.startsAt.toMillis() === startsAt.toMillis()) {
        throw new SenderError("That slot has been taken");
      }
    }
    ctx.db.appointment.id.update({ ...existing, startsAt });
  },
);

export const setPersona = spacetimedb.reducer(
  {
    identity: t.identity(),
    name: t.string(),
    service: t.option(t.string()),
    isAdmin: t.bool(),
  },
  (ctx, { identity, name, service, isAdmin }) => {
    if (!ctx.db.user.identity.find(ctx.sender)?.isAdmin) {
      throw new SenderError("Only an admin can set a persona");
    }
    // Admins can only demote each other, so there is always one left.
    if (ctx.sender.equals(identity) && !isAdmin) {
      throw new SenderError("You can't remove your own admin rights");
    }
    const persona = { identity, name, service, isAdmin };
    if (ctx.db.user.identity.find(identity)) {
      ctx.db.user.identity.update(persona);
    } else {
      ctx.db.user.insert(persona);
    }
  },
);

////////////////////////////////////////////////////////////
// DELETE
////////////////////////////////////////////////////////////
export const cancelAppointment = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    const existing = ctx.db.appointment.id.find(id);
    if (
      !existing ||
      !(
        ctx.sender.equals(existing.client) ||
        ctx.sender.equals(existing.provider)
      )
    ) {
      throw new SenderError("Appointment not found");
    }
    ctx.db.appointment.id.delete(id);
  },
);
