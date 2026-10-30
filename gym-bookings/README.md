# gym-bookings

An appointment book built on SpacetimeDB: two users, and an admin, see different views of the same data, in
real time.

Kris books a gym class with Alice and a piano lesson with Bob. Kris sees the week's calendar. Alice and Bob
each see their own upcoming appointments, and the list changes as Kris books. An admin watches the sessions per week go up on a
graph. All of it runs concurrently, from one `appointment` table.

It's the [todo-list](../todo-list) with one idea added. It shows:

- [One private table, three views](#one-table-three-views), each deciding what its readers can see
- [A view that aggregates](#a-view-that-aggregates), so the admin gets counts and no names
- [Narrowing a view from the client](#narrowing-a-view-from-the-client), so a calendar only receives its week
- [Reducers as the arbiter](#reducers-as-the-arbiter), when two people want the same slot

## How it works

### One table, three views

Every appointment is one row (`spacetimedb/src/index.ts`):

```ts
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
```

It's private, so no client can read it directly. Kris and Alice read that same row through different views:

```ts
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
```

`ctx.sender` is whoever is subscribing, so the one `bookAppointment` call updates Kris's calendar and Alice's
schedule, and Bob's connection hears nothing about it. The filter runs on the server: Bob's browser never receives
Alice's appointments.

The `provider` table is public, because clients need it to find out who they can book.

### A view that aggregates

The admin's page reads a third view, which returns a row per week rather than a row per appointment:

```ts
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
```

There's no reducer maintaining a counter. Sessions are counted in the week they take place, and the numbers
stay right however an appointment changes, because they're derived from the rows.

The query builder has no `GROUP BY`, so this view is a function. SpacetimeDB reruns it when the table changes,
where the two views above can be kept up to date row by row. It's also anonymous, so all subscribers share one
result, which contains no names at all. That's why it needs no admin check in this demo: the page is called
"admin", but the numbers are public. A real app that wanted them private would use `spacetimedb.view` and check
`ctx.sender`.

### Narrowing a view from the client

The calendar only wants one week, and a view can't take arguments. A client can still add its own filter
when it subscribes (`src/WeekCalendar.tsx`):

```ts
const [appointments, ready] = useTable(
  tables.myCalendar
    .where((a) => a.startsAt.gte(Timestamp.fromDate(monday)))
    .where((a) => a.startsAt.lt(Timestamp.fromDate(addDays(monday, 7)))),
);
```

The server applies that filter too, so only the week's rows are sent. Turn the page and `useTable` swaps the
subscription. `src/Schedule.tsx` does the same with everything from today onwards in `my_schedule`.

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
the error instead of a double booking. `rescheduleAppointment` makes the same check.

The rest is the same as the todo list: `rescheduleAppointment` is for the client only, and `cancelAppointment`
is for either the client or the provider, so Alice cancelling makes a row vanish from Kris's calendar.

### Who you are

There's no login. `?as=alice` picks which token the browser keeps in `localStorage` (`src/main.tsx`), so tabs
in one browser can be different users, and each keeps its identity across reloads. Anyone can open any
page, so this stands in for a real login, which is where [SpacetimeAuth or another OIDC
provider](https://spacetimedb.com/docs) would go. The identities and the views wouldn't change.

Opening Alice's page calls `offerService`, which is what makes Alice bookable.

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

Open these side by side, starting with Alice and Bob so that Kris has someone to book:

| Page                              | Who                            |
| --------------------------------- | ------------------------------ |
| `http://localhost:5173/?as=alice` | Alice's appointments           |
| `http://localhost:5173/?as=bob`   | Bob's appointments             |
| `http://localhost:5173/?as=admin` | The graph of sessions per week |
| `http://localhost:5173/?as=kris`  | Kris's week, where you book    |

On Kris's page, pick a provider and click a slot to book it. Click an appointment and then an empty slot to
move it. The × cancels it, and Alice and Bob have one too.

The book doesn't refuse times in the past, so the demo works at any hour of the day.

`spacetime.json` points the CLI at the local server. `spacetime dev` writes a `spacetime.local.json`
(gitignored) naming a database of its own. While that file exists, the CLI uses that name, so set
`VITE_SPACETIMEDB_DB_NAME` in `.env.local` to match.

To see what's really in the table (it's private, but you published the database):

```bash
spacetime sql gym-bookings "SELECT * FROM appointment"
```

## Where things are

| File                              | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `spacetimedb/src/index.ts`        | The module: two tables, three views, and the reducers                 |
| `spacetimedb/tests/index.test.ts` | Tests for the reducers and the views, against an in-memory database   |
| `src/main.tsx`                    | Connects to SpacetimeDB, with one identity per `?as=` person          |
| `src/App.tsx`                     | Picks the page for that person                                        |
| `src/WeekCalendar.tsx`            | The client's week: subscribes to `my_calendar`, books and reschedules |
| `src/Schedule.tsx`                | A provider's appointments by date: subscribes to `my_schedule`        |
| `src/AdminGraph.tsx`              | The admin's graph: subscribes to `sessions_per_week`                  |
| `src/module_bindings/`            | Client bindings, generated from the module                            |

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
