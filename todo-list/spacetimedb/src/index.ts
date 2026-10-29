import { schema, table, t, SenderError } from "spacetimedb/server";

const todo = table(
  { name: "todo" },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    text: t.string(),
    done: t.bool(),
    createdAt: t.timestamp(),
  },
);

const spacetimedb = schema({ todo });
export default spacetimedb;

// The todo table is private; each client sees only its own todos through this.
export const myTodos = spacetimedb.view(
  { name: "my_todos", public: true },
  t.array(todo.rowType),
  (ctx) => ctx.from.todo.where((todo) => todo.owner.eq(ctx.sender)),
);

export const createTodo = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    if (text.trim() === "") throw new SenderError("Todo text cannot be empty");

    ctx.db.todo.insert({
      id: 0n,
      owner: ctx.sender,
      text,
      done: false,
      createdAt: ctx.timestamp,
    });
  },
);

export const updateTodo = spacetimedb.reducer(
  { id: t.u64(), text: t.string(), done: t.bool() },
  (ctx, { id, text, done }) => {
    if (text.trim() === "") throw new SenderError("Todo text cannot be empty");

    const existing = ctx.db.todo.id.find(id);
    if (!existing || !existing.owner.equals(ctx.sender)) {
      throw new SenderError("Todo not found");
    }
    ctx.db.todo.id.update({ ...existing, text, done });
  },
);

export const deleteTodo = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    const existing = ctx.db.todo.id.find(id);
    if (!existing || !existing.owner.equals(ctx.sender)) {
      throw new SenderError("Todo not found");
    }
    ctx.db.todo.id.delete(id);
  },
);
