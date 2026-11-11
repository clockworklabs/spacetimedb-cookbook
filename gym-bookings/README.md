# gym-bookings

An appointment book built on SpacetimeDB: two users, and an admin, see different views of the same data, in
real time.

Kris books a gym class with Alice and a piano lesson with Bob. Kris sees the week's calendar. Alice and Bob
each see their own upcoming appointments, and the list changes as Kris books. An admin watches the sessions per week go up on a
graph. All of it runs concurrently, from one `appointment` table.

It's the [todo-list](../todo-list) with one idea added. It shows:

- [Private tables, public views](#private-tables-public-views), each view deciding what its readers can see
- [A view that aggregates](#a-view-that-aggregates), so the admin gets counts and no names
- [Narrowing a view from the client](#narrowing-a-view-from-the-client), so a calendar only receives its week
- [Reducers as the arbiter](#reducers-as-the-arbiter), when two people want the same slot

## How it works

### Private tables, public views

Every appointment is one row (`spacetimedb/src/index.ts`):

```ts
const appointment = table(
  { name: "appointment" },
  {
    id: t.u64().primaryKey().autoInc(),
    client: t.identity().index("btree"),
    provider: t.identity().index("btree"),
    startsAt: t.timestamp(),
  },
);
```

It's private, so no client can read it directly. So is the `user` table, which holds each person's name, the
service they offer if any, and whether they're an admin. Kris and Alice both read that appointment through one
view:

```ts
export const myAppointments = spacetimedb.view(
  { name: "my_appointments", public: true },
  t.array(AppointmentDetail),
  (ctx) => {
    const userFor = (identity: Identity) => ctx.db.user.identity.find(identity);

    // Keyed by id, so a class you've booked with yourself appears once.
    const mine = new Map(
      [
        ...ctx.db.appointment.client.filter(ctx.sender),
        ...ctx.db.appointment.provider.filter(ctx.sender),
      ].map((appointment) => [appointment.id, appointment]),
    );

    return [...mine.values()].map((appointment) => {
      const provider = userFor(appointment.provider);
      const client = userFor(appointment.client);
      return {
        ...appointment,
        clientName: client?.name ?? "Someone",
        providerName: provider?.name ?? "Someone",
        service: provider?.service,
      };
    });
  },
);
```

`ctx.sender` is whoever is subscribing, so the one `createAppointment` call updates Kris's calendar and Alice's
schedule, and Bob's connection hears nothing about it. The view runs on the server: Bob's browser never receives
Alice's appointments.

An appointment stores only identities, so the view adds the names. That's why it's a function rather than a
query: a query returns rows from one table, and can't add columns from another. The two index lookups keep each
run down to the caller's own appointments, and a renamed client shows up under their new name on the next run.

Two more views hand out users directly, and nobody can list them all:

```ts
export const providers = spacetimedb.anonymousView(
  { name: "providers", public: true },
  t.array(user.rowType),
  (ctx) => [...ctx.db.user.iter()].filter((u) => u.service),
);

export const me = spacetimedb.view(
  { name: "me", public: true },
  t.array(user.rowType),
  (ctx) => ctx.from.user.where((u) => u.identity.eq(ctx.sender)),
);
```

`providers` is the same for everyone: the classes you can book. `me` tells the app your name and whether you're
an admin.

### A view that aggregates

The admin's page reads another view, which returns a row per week rather than a row per appointment:

```ts
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
```

There's no reducer maintaining a counter. Sessions are counted in the week they take place, and the numbers
stay right however an appointment changes, because they're derived from the rows.

The query builder has no `GROUP BY`, so this view is a function too. SpacetimeDB reruns a function when the
tables it reads change, where a query such as `me` can be kept up to date row by row.

The check on `ctx.sender` is what keeps the numbers private. The client hides the Admin tab from anyone else,
but that's only tidiness: a non-admin who subscribes to this view by hand gets no rows.

### Narrowing a view from the client

The calendar only wants one week of the classes you've booked, and a view can't take arguments. A client can
still add its own filter when it subscribes (`src/WeekCalendar.tsx`):

```ts
const [appointments, ready] = useTable(
  tables.myAppointments
    .where((a) => a.client.eq(identity!))
    .where((a) => a.startsAt.gte(Timestamp.fromDate(monday)))
    .where((a) => a.startsAt.lt(Timestamp.fromDate(addDays(monday, 7)))),
);
```

The server applies that filter too, so only the week's rows are sent. Turn the page and `useTable` swaps the
subscription. `src/Schedule.tsx` does the same with everything from today onwards in `my_appointments`.

The view decides what you're allowed to see. The `where` decides what you currently want.

### Reducers as the arbiter

If two people go for the same hour, the reducer decides:

```ts
for (const booked of ctx.db.appointment.provider.filter(provider)) {
  if (booked.startsAt.toMillis() === startsAt.toMillis()) {
    throw new SenderError("That slot has just been taken");
  }
}
```

Reducers run one at a time in transactions, so the second caller always sees the first caller's row, and gets
the error instead of a double booking. `updateAppointment` makes the same check.

The rest is the same as the todo list: `updateAppointment` is for the client only, and `deleteAppointment`
is for either the client or the provider, so Alice cancelling makes a row vanish from Kris's calendar.

### Who you are

Each browser session gets its own identity, and keeps its token in `localStorage` (`src/main.tsx`). An identity
means nothing until an admin gives it a persona:

```ts
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
```

Whoever publishes the database becomes the first admin, in the module's `init`. There's no login: a real app
would add [SpacetimeAuth or another OIDC provider](https://spacetimedb.com/docs) here. The identities and the
views wouldn't change.

## Running the demo

You need Node.js, pnpm, prettier and the SpacetimeDB CLI. The `flake.nix` at the root of this repository
provides them all: run `direnv allow`, or `nix develop`.

```bash
pnpm install

# In another terminal: a local SpacetimeDB server on port 3000.
spacetime start

# Publish the module under the database name the client uses by default.
spacetime publish gym-bookings

# Serve the client at http://localhost:5173.
pnpm dev
```

Open `http://localhost:5173` in a separate browser session for each person, and each shows its ID at the
bottom of the page. Chrome's incognito windows all share one session, so use separate browser profiles, or a
different browser for each. From your terminal, using the identity you published with:

```bash
ID=0xc200...   # the ID from that session's page

# Arguments: identity, name, service, is admin.
spacetime call gym-bookings set_persona "\"$ID\"" '"Kris"' '{"none":[]}' false
spacetime call gym-bookings set_persona "\"$ID\"" '"Alice"' '{"some":"Gym class"}' false
spacetime call gym-bookings set_persona "\"$ID\"" '"Bob"' '{"some":"Piano lesson"}' false
spacetime call gym-bookings set_persona "\"$ID\"" '"Sam"' '{"none":[]}' true
```

Each page changes as soon as the call lands. Everyone gets Week and Schedule, and admins get Admin too.

On the Week page, pick a provider and click a slot to book it. Click an appointment and then an empty slot to
move it. The × cancels it, and providers have one too on their Schedule page.

The book doesn't refuse times in the past, so the demo works at any hour of the day.

This demo only ever uses the local server. The client connects to `ws://localhost:3000`, and `spacetime.json`
points the CLI there, as long as you run it from this folder. `spacetime dev` writes a `spacetime.local.json`
(gitignored) naming a database of its own. While that file exists, the CLI uses that name, so set
`VITE_SPACETIMEDB_DB_NAME` in `.env.local` to match.

To see what's really in the table (it's private, but you published the database):

```bash
spacetime sql gym-bookings "SELECT * FROM appointment"
```

## Where things are

| File                              | What it does                                                              |
| --------------------------------- | ------------------------------------------------------------------------- |
| `spacetimedb/src/index.ts`        | The module: two tables, four views, and the reducers                      |
| `spacetimedb/tests/index.test.ts` | Tests for the reducers and the views, against an in-memory database       |
| `src/main.tsx`                    | Connects to SpacetimeDB, keeping this browser's identity                  |
| `src/App.tsx`                     | Finds your persona, and switches between Week, Schedule and Admin         |
| `src/WeekCalendar.tsx`            | The client's week: subscribes to `my_appointments`, books and reschedules |
| `src/Schedule.tsx`                | Your appointments by date: subscribes to `my_appointments`                |
| `src/AdminGraph.tsx`              | The admin's graph: subscribes to `sessions_per_week`                      |
| `src/module_bindings/`            | Client bindings, generated from the module                                |

## Checking a change

The bindings in `src/module_bindings` are generated and committed. After changing a table, view or reducer:

```bash
spacetime generate
prettier --write src/module_bindings
spacetime publish gym-bookings
```

```bash
pnpm test     # the module's tests
pnpm build    # type-checks and builds the client
```
