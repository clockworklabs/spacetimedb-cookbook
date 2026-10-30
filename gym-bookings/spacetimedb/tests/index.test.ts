import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import {
  createModuleTestHarness,
  TestAuth,
  TestClock,
} from "spacetimedb/server/test-utils";
import spacetimedb, * as moduleExports from "../src/index";
import {
  bookAppointment,
  cancelAppointment,
  init,
  myCalendar,
  mySchedule,
  rescheduleAppointment,
  sessionsPerWeek,
  setPersona,
} from "../src/index";

const time = (iso: string) => Timestamp.fromDate(new Date(iso));

const NOW = time("2026-10-29T09:00:00Z");
const THU_10AM = time("2026-10-29T10:00:00Z");
const THU_11AM = time("2026-10-29T11:00:00Z");
const SUN_10AM = time("2026-11-01T10:00:00Z");
const MON_10AM = time("2026-11-02T10:00:00Z");

const client = (sub: string, connectionId: bigint) =>
  TestAuth.fromJwtPayload(
    JSON.stringify({ iss: "https://test.example", sub }),
    new ConnectionId(connectionId),
  );

const kris = client("kris", 1n);
const dana = client("dana", 2n);
const alice = client("alice", 3n);
const bob = client("bob", 4n);
const owner = client("owner", 5n);

let test: ReturnType<typeof newHarness>;
const newHarness = () =>
  createModuleTestHarness(spacetimedb, moduleExports, {
    clock: new TestClock(NOW),
  });

const identityOf = (auth: TestAuth) =>
  test.withReducerTx(auth, (ctx) => ctx.sender);

const appointments = () => [...test.db.appointment.iter()];

const book = (auth: TestAuth, provider: TestAuth, startsAt: Timestamp) => {
  const before = new Set(appointments().map((a) => a.id));
  const providerId = identityOf(provider);
  test.withReducerTx(auth, (ctx) =>
    bookAppointment(ctx, {
      provider: providerId,
      startsAt,
    }),
  );
  return appointments().find((a) => !before.has(a.id))!;
};

const viewOf = (view: typeof myCalendar, auth: TestAuth) =>
  test.runQuery<ReturnType<typeof appointments>[number]>(
    view(test.viewContext(auth)) as never,
  );

const assign = (
  by: TestAuth,
  who: TestAuth,
  name: string,
  service?: string,
  isAdmin = false,
) => {
  const identity = identityOf(who);
  test.withReducerTx(by, (ctx) =>
    setPersona(ctx, { identity, name, service, isAdmin }),
  );
};

const weeks = (auth: TestAuth) =>
  sessionsPerWeek(test.viewContext(auth)) as Array<{
    weekStart: Timestamp;
    sessions: number;
  }>;

beforeEach(() => {
  test = newHarness();
  test.withReducerTx(owner, (ctx) => init(ctx, {}));
  assign(owner, alice, "Alice", "Gym class");
  assign(owner, bob, "Bob", "Piano lesson");
  assign(owner, kris, "Kris");
  assign(owner, dana, "Dana");
});

describe("setPersona", () => {
  it("changes an existing persona when called again", () => {
    assign(owner, alice, "Alice", "Yoga");

    expect(test.db.person.identity.find(identityOf(alice))?.service).toBe(
      "Yoga",
    );
    expect([...test.db.person.iter()]).toHaveLength(5);
  });

  it("refuses anyone who isn't an admin", () => {
    expect(() => assign(kris, kris, "Kris", undefined, true)).toThrow(
      "Only an admin can set a persona",
    );
    expect(test.db.person.identity.find(identityOf(kris))?.isAdmin).toBe(false);
  });

  it("lets a new admin set personas", () => {
    assign(owner, kris, "Kris", undefined, true);
    assign(kris, dana, "Dana", "Yoga");

    expect(test.db.person.identity.find(identityOf(dana))?.service).toBe(
      "Yoga",
    );
  });
});

describe("bookAppointment", () => {
  it("books the slot for the caller", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(appointments()).toHaveLength(1);
    expect(booked.client.isEqual(identityOf(kris))).toBe(true);
    expect(booked.provider.isEqual(identityOf(alice))).toBe(true);
  });

  it("refuses a slot the provider has already filled", () => {
    book(kris, alice, THU_10AM);

    expect(() => book(dana, alice, THU_10AM)).toThrow(
      "That slot has just been taken",
    );
    expect(appointments()).toHaveLength(1);
  });

  it("lets two providers fill the same hour", () => {
    book(kris, alice, THU_10AM);
    book(dana, bob, THU_10AM);

    expect(appointments()).toHaveLength(2);
  });

  it("refuses a provider who isn't offering anything", () => {
    expect(() => book(kris, dana, THU_10AM)).toThrow("Provider not found");
  });

  it("refuses a caller without a persona", () => {
    expect(() => book(client("stranger", 6n), alice, THU_10AM)).toThrow(
      "You don't have a persona yet",
    );
  });

  it("takes the client's name from their persona, not from the caller", () => {
    expect(book(kris, alice, THU_10AM).clientName).toBe("Kris");
  });
});

describe("rescheduleAppointment", () => {
  it("moves the appointment", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(kris, (ctx) =>
      rescheduleAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
    );

    expect(
      test.db.appointment.id.find(booked.id)!.startsAt.microsSinceUnixEpoch,
    ).toBe(THU_11AM.microsSinceUnixEpoch);
  });

  it("refuses a slot the provider has already filled", () => {
    const booked = book(kris, alice, THU_10AM);
    book(dana, alice, THU_11AM);

    expect(() =>
      test.withReducerTx(kris, (ctx) =>
        rescheduleAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
      ),
    ).toThrow("That slot has just been taken");
  });

  it("refuses anyone but the client", () => {
    const booked = book(kris, alice, THU_10AM);

    for (const auth of [dana, alice]) {
      expect(() =>
        test.withReducerTx(auth, (ctx) =>
          rescheduleAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
        ),
      ).toThrow("Appointment not found");
    }
  });
});

describe("cancelAppointment", () => {
  it("lets the client cancel", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(kris, (ctx) =>
      cancelAppointment(ctx, { id: booked.id }),
    );

    expect(appointments()).toHaveLength(0);
  });

  it("lets the provider cancel", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(alice, (ctx) =>
      cancelAppointment(ctx, { id: booked.id }),
    );

    expect(appointments()).toHaveLength(0);
  });

  it("refuses anyone else", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(() =>
      test.withReducerTx(bob, (ctx) =>
        cancelAppointment(ctx, { id: booked.id }),
      ),
    ).toThrow("Appointment not found");
    expect(appointments()).toHaveLength(1);
  });
});

describe("views of the one table", () => {
  it("shows the same appointment to its client and its provider, and nobody else", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(viewOf(myCalendar, kris).map((a) => a.id)).toEqual([booked.id]);
    expect(viewOf(mySchedule, alice).map((a) => a.id)).toEqual([booked.id]);

    expect(viewOf(myCalendar, alice)).toHaveLength(0);
    expect(viewOf(mySchedule, kris)).toHaveLength(0);
    expect(viewOf(mySchedule, bob)).toHaveLength(0);
    expect(viewOf(myCalendar, dana)).toHaveLength(0);
  });

  it("counts sessions per Monday-to-Sunday week", () => {
    book(kris, alice, THU_10AM);
    book(kris, bob, SUN_10AM);
    book(dana, alice, MON_10AM);

    expect(
      weeks(owner)
        .map((w) => [
          w.weekStart.toDate().toISOString().slice(0, 10),
          w.sessions,
        ])
        .sort(),
    ).toEqual([
      ["2026-10-26", 2],
      ["2026-11-02", 1],
    ]);
  });

  it("gives the weekly counts to admins only", () => {
    book(kris, alice, THU_10AM);

    expect(weeks(owner)).toHaveLength(1);
    expect(weeks(kris)).toHaveLength(0);
    expect(weeks(alice)).toHaveLength(0);
  });
});
