// The module entry. SpacetimeDB registers each of its named exports, and
// refuses any that isn't a lifecycle hook, reducer or procedure. So reducers
// and procedures are defined with the rest of their process, and only
// re-exported here.

import spacetimedb from "./schema";
import { applySchedulers } from "./schedules";

export default spacetimedb;

export { expireOldEdits, fetchRecentEdits } from "./edits";
export { fetchArticlePreviews } from "./previews";
export { deleteOldHistory } from "./history";
export { updateSchedulers } from "./schedules";

// Runs once, when the database is created, with whoever published it as the
// sender.
export const init = spacetimedb.init((ctx) => {
  ctx.db.user.insert({ identity: ctx.sender, admin: true });
  applySchedulers(ctx);
});
