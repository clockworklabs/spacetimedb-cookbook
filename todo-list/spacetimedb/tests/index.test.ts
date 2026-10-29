import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import {
  createModuleTestHarness,
  TestAuth,
  TestClock,
} from "spacetimedb/server/test-utils";
import spacetimedb, * as moduleExports from "../src/index";
import {
  createTodo,
  deleteTodo,
  myTodos as myTodosView,
  updateTodo,
} from "../src/index";

const NOW = Timestamp.fromDate(new Date("2026-10-29T09:00:00Z"));

const client = (sub: string, connectionId: bigint) =>
  TestAuth.fromJwtPayload(
    JSON.stringify({ iss: "https://test.example", sub }),
    new ConnectionId(connectionId),
  );

const alice = client("alice", 1n);
const bob = client("bob", 2n);

let test: ReturnType<typeof newHarness>;
const newHarness = () =>
  createModuleTestHarness(spacetimedb, moduleExports, {
    clock: new TestClock(NOW),
  });

beforeEach(() => {
  test = newHarness();
});

const todos = () => [...test.db.todo.iter()];

const identityOf = (auth: TestAuth) =>
  test.withReducerTx(auth, (ctx) => ctx.sender);

const createAndReturn = (auth: TestAuth, text: string) => {
  const before = new Set(todos().map((t) => t.id));
  test.withReducerTx(auth, (ctx) => createTodo(ctx, { text }));
  return todos().find((t) => !before.has(t.id))!;
};

describe("createTodo", () => {
  it("inserts a todo owned by the caller, stamped with the server time", () => {
    test.withReducerTx(alice, (ctx) => createTodo(ctx, { text: "Buy milk" }));

    const [todo] = todos();
    expect(todos()).toHaveLength(1);
    expect(todo.text).toBe("Buy milk");
    expect(todo.done).toBe(false);
    expect(todo.owner.isEqual(identityOf(alice))).toBe(true);
    expect(todo.createdAt.microsSinceUnixEpoch).toBe(NOW.microsSinceUnixEpoch);
  });

  it("rejects empty text", () => {
    expect(() =>
      test.withReducerTx(alice, (ctx) => createTodo(ctx, { text: "" })),
    ).toThrow("Todo text cannot be empty");
    expect(todos()).toHaveLength(0);
  });

  it("rejects whitespace-only text", () => {
    expect(() =>
      test.withReducerTx(alice, (ctx) => createTodo(ctx, { text: " \t\n " })),
    ).toThrow("Todo text cannot be empty");
    expect(todos()).toHaveLength(0);
  });
});

describe("updateTodo", () => {
  it("changes text and status, keeping owner and creation time", () => {
    const original = createAndReturn(alice, "Buy milk");

    test.withReducerTx(alice, (ctx) =>
      updateTodo(ctx, { id: original.id, text: "Buy oat milk", done: true }),
    );

    expect(todos()).toHaveLength(1);
    const updated = test.db.todo.id.find(original.id)!;
    expect(updated.text).toBe("Buy oat milk");
    expect(updated.done).toBe(true);
    expect(updated.owner.isEqual(original.owner)).toBe(true);
    expect(updated.createdAt.microsSinceUnixEpoch).toBe(
      original.createdAt.microsSinceUnixEpoch,
    );
  });

  it("rejects empty text without changing the todo", () => {
    const original = createAndReturn(alice, "Buy milk");

    expect(() =>
      test.withReducerTx(alice, (ctx) =>
        updateTodo(ctx, { id: original.id, text: "", done: true }),
      ),
    ).toThrow("Todo text cannot be empty");
    expect(test.db.todo.id.find(original.id)).toEqual(original);
  });

  it("refuses to update another user's todo", () => {
    const original = createAndReturn(alice, "Buy milk");

    expect(() =>
      test.withReducerTx(bob, (ctx) =>
        updateTodo(ctx, { id: original.id, text: "Hijacked", done: true }),
      ),
    ).toThrow("Todo not found");
    expect(test.db.todo.id.find(original.id)).toEqual(original);
  });

  it("rejects an id that doesn't exist", () => {
    expect(() =>
      test.withReducerTx(alice, (ctx) =>
        updateTodo(ctx, { id: 999n, text: "Ghost", done: false }),
      ),
    ).toThrow("Todo not found");
    expect(todos()).toHaveLength(0);
  });
});

describe("deleteTodo", () => {
  it("deletes the caller's todo and leaves others alone", () => {
    const milk = createAndReturn(alice, "Buy milk");
    const dog = createAndReturn(alice, "Walk dog");

    test.withReducerTx(alice, (ctx) => deleteTodo(ctx, { id: milk.id }));

    expect(todos().map((t) => t.id)).toEqual([dog.id]);
  });

  it("refuses to delete another user's todo", () => {
    const milk = createAndReturn(alice, "Buy milk");

    expect(() =>
      test.withReducerTx(bob, (ctx) => deleteTodo(ctx, { id: milk.id })),
    ).toThrow("Todo not found");
    expect(todos()).toHaveLength(1);
  });

  it("rejects an id that doesn't exist", () => {
    expect(() =>
      test.withReducerTx(alice, (ctx) => deleteTodo(ctx, { id: 999n })),
    ).toThrow("Todo not found");
  });
});

describe("myTodos", () => {
  const myTodos = (auth: TestAuth) =>
    test.runQuery<ReturnType<typeof todos>[number]>(
      myTodosView(test.viewContext(auth)),
    );

  it("shows each user only their own todos", () => {
    const milk = createAndReturn(alice, "Buy milk");
    const dog = createAndReturn(bob, "Walk dog");

    expect(myTodos(alice).map((t) => t.id)).toEqual([milk.id]);
    expect(myTodos(bob).map((t) => t.id)).toEqual([dog.id]);
  });
});
