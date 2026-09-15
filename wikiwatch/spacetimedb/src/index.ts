// The module entry. SpacetimeDB registers each of its named exports, and
// refuses any that isn't a lifecycle hook, reducer or procedure. So the
// scheduled exports are defined with the rest of their process, and only
// re-exported here.

import spacetimedb from "./schema";
import { ensureSchedules } from "./poll";

export default spacetimedb;

export { pollWikipedia } from "./poll";
export { sweepLiveSet } from "./live";
export { pruneOldData } from "./prune";

export const init = spacetimedb.init((ctx) => {
  ensureSchedules(ctx);
});
