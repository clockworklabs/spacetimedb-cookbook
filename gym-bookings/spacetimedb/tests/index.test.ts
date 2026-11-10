import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import {
  createModuleTestHarness,
  TestAuth,
  TestClock,
} from "spacetimedb/server/test-utils";
import spacetimedb, * as moduleExports from "../src/index";
import {
  createAppointment,
  deleteAppointment,
  init,
  myBookings,
  myWorkSchedule,
  updateAppointment,
  sessionsPerWeek,
  setPersona,
} from "../src/index";

const time = (iso: string) => Timestamp.fromDate(new Date(iso));

const NOW = time("2026-10-29T09:00:00Z");
const THU_10AM = time("2026-10-29T10:00:00Z");
const THU_11AM = time("2026-10-29T11:00:00Z");
const THU_10_30AM = time("2026-10-29T10:30:00Z");
const THU_JUST_AFTER_10AM = time("2026-10-29T10:00:00.001Z");
const SUN_10AM = time("2026-11-01T10:00:00Z");
const MON_10AM = time("2026-11-02T10:00:00Z");
const WED_10AM = time("2026-10-28T10:00:00Z");

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
let clock: TestClock;
const newHarness = () => {
  clock = new TestClock(NOW);
  return createModuleTestHarness(spacetimedb, moduleExports, { clock });
};

const identityOf = (auth: TestAuth) =>
  test.withReducerTx(auth, (ctx) => ctx.sender);

const appointments = () => [...test.db.appointment.iter()];

const book = (auth: TestAuth, provider: TestAuth, startsAt: Timestamp) => {
  const before = new Set(appointments().map((a) => a.id));
  const providerId = identityOf(provider);
  test.withReducerTx(auth, (ctx) =>
    createAppointment(ctx, {
      provider: providerId,
      startsAt,
    }),
  );
  return appointments().find((a) => !before.has(a.id))!;
};

const viewOf = (view: typeof myBookings, auth: TestAuth) =>
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

    expect(test.db.user.identity.find(identityOf(alice))?.service).toBe("Yoga");
    expect([...test.db.user.iter()]).toHaveLength(5);
  });

  it("refuses anyone who isn't an admin", () => {
    expect(() => assign(kris, kris, "Kris", undefined, true)).toThrow(
      "Only an admin can set a persona",
    );
    expect(test.db.user.identity.find(identityOf(kris))?.isAdmin).toBe(false);
  });

  it("refuses to let an admin remove their own admin rights", () => {
    expect(() => assign(owner, owner, "Owner", undefined, false)).toThrow(
      "You can't remove your own admin rights",
    );
    expect(test.db.user.identity.find(identityOf(owner))?.isAdmin).toBe(true);
  });

  it("lets a new admin set personas", () => {
    assign(owner, kris, "Kris", undefined, true);
    assign(kris, dana, "Dana", "Yoga");

    expect(test.db.user.identity.find(identityOf(dana))?.service).toBe("Yoga");
  });
});

describe("createAppointment", () => {
  it("books the slot for the caller", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(appointments()).toHaveLength(1);
    expect(booked.client.isEqual(identityOf(kris))).toBe(true);
    expect(booked.provider.isEqual(identityOf(alice))).toBe(true);
  });

  it("refuses a slot the provider has already filled", () => {
    book(kris, alice, THU_10AM);

    expect(() => book(dana, alice, THU_10AM)).toThrow(
      "That slot has been taken",
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

  it("refuses a caller without an account", () => {
    expect(() => book(client("stranger", 6n), alice, THU_10AM)).toThrow(
      "You don't have an account yet",
    );
  });

  it("refuses a time that isn't on the hour", () => {
    for (const startsAt of [THU_10_30AM, THU_JUST_AFTER_10AM]) {
      expect(() => book(kris, alice, startsAt)).toThrow(
        "Appointments start on the hour",
      );
    }
    expect(appointments()).toHaveLength(0);
  });

  it("refuses a time that has already passed", () => {
    expect(() => book(kris, alice, WED_10AM)).toThrow(
      "That time has already passed",
    );
    expect(appointments()).toHaveLength(0);
  });

  it("records the caller as the client", () => {
    expect(book(kris, alice, THU_10AM).client.isEqual(identityOf(kris))).toBe(
      true,
    );
  });
});

describe("updateAppointment", () => {
  it("moves the appointment", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(kris, (ctx) =>
      updateAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
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
        updateAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
      ),
    ).toThrow("That slot has been taken");
  });

  it("refuses a time that isn't on the hour", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(() =>
      test.withReducerTx(kris, (ctx) =>
        updateAppointment(ctx, { id: booked.id, startsAt: THU_10_30AM }),
      ),
    ).toThrow("Appointments start on the hour");
    expect(
      test.db.appointment.id.find(booked.id)!.startsAt.microsSinceUnixEpoch,
    ).toBe(THU_10AM.microsSinceUnixEpoch);
  });

  it("refuses to move an appointment into the past", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(() =>
      test.withReducerTx(kris, (ctx) =>
        updateAppointment(ctx, { id: booked.id, startsAt: WED_10AM }),
      ),
    ).toThrow("That time has already passed");
  });

  it("refuses to move an appointment that has already started", () => {
    const booked = book(kris, alice, THU_10AM);
    clock.set(THU_10_30AM);

    expect(() =>
      test.withReducerTx(kris, (ctx) =>
        updateAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
      ),
    ).toThrow("That time has already passed");
  });

  it("refuses anyone but the client", () => {
    const booked = book(kris, alice, THU_10AM);

    for (const auth of [dana, alice]) {
      expect(() =>
        test.withReducerTx(auth, (ctx) =>
          updateAppointment(ctx, { id: booked.id, startsAt: THU_11AM }),
        ),
      ).toThrow("Appointment not found");
    }
  });
});

describe("deleteAppointment", () => {
  it("lets the client cancel", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(kris, (ctx) =>
      deleteAppointment(ctx, { id: booked.id }),
    );

    expect(appointments()).toHaveLength(0);
  });

  it("lets the provider cancel", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(alice, (ctx) =>
      deleteAppointment(ctx, { id: booked.id }),
    );

    expect(appointments()).toHaveLength(0);
  });

  it("lets an admin cancel an appointment they aren't part of", () => {
    const booked = book(kris, alice, THU_10AM);

    test.withReducerTx(owner, (ctx) =>
      deleteAppointment(ctx, { id: booked.id }),
    );

    expect(appointments()).toHaveLength(0);
  });

  it("refuses to cancel an appointment that has already started, even for an admin", () => {
    const booked = book(kris, alice, THU_10AM);
    clock.set(THU_10_30AM);

    for (const auth of [kris, alice, owner]) {
      expect(() =>
        test.withReducerTx(auth, (ctx) =>
          deleteAppointment(ctx, { id: booked.id }),
        ),
      ).toThrow("That time has already passed");
    }
    expect(appointments()).toHaveLength(1);
  });

  it("refuses anyone else", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(() =>
      test.withReducerTx(bob, (ctx) =>
        deleteAppointment(ctx, { id: booked.id }),
      ),
    ).toThrow("Appointment not found");
    expect(appointments()).toHaveLength(1);
  });
});

describe("views of the one table", () => {
  it("shows the same appointment to its client and its provider, and nobody else", () => {
    const booked = book(kris, alice, THU_10AM);

    expect(viewOf(myBookings, kris).map((a) => a.id)).toEqual([booked.id]);
    expect(viewOf(myWorkSchedule, alice).map((a) => a.id)).toEqual([booked.id]);
    expect(viewOf(myWorkSchedule, kris).map((a) => a.id)).toEqual([booked.id]);

    expect(viewOf(myBookings, alice)).toHaveLength(0);
    expect(viewOf(myWorkSchedule, bob)).toHaveLength(0);
    expect(viewOf(myBookings, dana)).toHaveLength(0);
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

  it("puts a provider's own bookings on their schedule alongside their work", () => {
    const teaching = book(kris, alice, THU_10AM);
    const learning = book(alice, bob, MON_10AM);

    expect(
      viewOf(myWorkSchedule, alice)
        .map((a) => a.id)
        .sort(),
    ).toEqual([teaching.id, learning.id].sort());
  });

  it("gives the weekly counts to admins only", () => {
    book(kris, alice, THU_10AM);

    expect(weeks(owner)).toHaveLength(1);
    expect(weeks(kris)).toHaveLength(0);
    expect(weeks(alice)).toHaveLength(0);
  });
});
