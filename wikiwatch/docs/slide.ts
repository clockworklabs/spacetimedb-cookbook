import { Timestamp } from "spacetimedb";
import { schema, table, t } from "spacetimedb/server";

const edit = table(
  { public: true },
  {
    rc_id: t.u64().primaryKey(),
    title: t.string(),
    user_name: t.string(),
    edited_at: t.timestamp(),
  },
);

const fetch_timer = table(
  {},
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

const spacetimedb = schema({ edit, fetch_timer });
export default spacetimedb;

export const fetchRecentEdits = spacetimedb.procedure(
  { onSchedule: fetch_timer },
  { timer: fetch_timer.rowType },
  t.unit(),
  (ctx) => {
    const response = ctx.http.fetch(
      "https://en.wikipedia.org/w/api.php?action=query&format=json" +
        "&list=recentchanges&rcprop=ids|title|user|timestamp&rclimit=100",
      {
        headers: { "User-Agent": "wikiwatch (https://spacetimedb.com)" },
      },
    );
    const { query } = JSON.parse(response.text());

    ctx.withTx((tx) => {
      for (const rc of query.recentchanges) {
        if (tx.db.edit.rc_id.find(BigInt(rc.rcid))) continue;
        tx.db.edit.insert({
          rc_id: BigInt(rc.rcid),
          title: rc.title,
          user_name: rc.user,
          edited_at: Timestamp.fromDate(new Date(rc.timestamp)),
        });
      }
    });
    return {};
  },
);
