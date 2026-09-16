// A small client for the parts of the MediaWiki Action API we need.
// https://www.mediawiki.org/wiki/API:RecentChanges
// https://www.mediawiki.org/wiki/API:Query (prop=extracts|pageimages|description)

import { TimeDuration, Timestamp } from "spacetimedb";
import { SETTINGS_ID, type Edit, type ProcCtx, type Thumbnail } from "./schema";

const API_URL = "https://en.wikipedia.org/w/api.php";

// Wikimedia's User-Agent policy asks for a descriptive agent with contact
// details; generic agents get throttled or blocked. The contact comes from the
// private settings table rather than the source.
// https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
const AGENT_NAME = "wikiwatch/0.1";
const FALLBACK_CONTACT = "SpacetimeDB demo module; https://spacetimedb.com";

export function userAgent(ctx: ProcCtx): string {
  const contact = ctx.withTx(
    (tx) => tx.db.settings.id.find(SETTINGS_ID)?.wikipedia_contact,
  );
  // A line break in a header value would start a new header.
  const cleaned = contact?.replace(/[\r\n]+/g, " ").trim();
  return `${AGENT_NAME} (${cleaned || FALLBACK_CONTACT})`;
}

const REQUEST_TIMEOUT = TimeDuration.fromMillis(10_000);

// Ask Wikipedia to refuse us (rather than queue us) when its replicas lag.
const MAX_LAG_SECONDS = "5";

const RC_PAGE_SIZE = "500";

export const PREVIEW_BATCH_SIZE = 20; // `extracts` caps at 20 pages per request

type Http = ProcCtx["http"];
type Params = Record<string, string>;

// An edit row, less the live flag, which depends on when it's ingested.
export type RecentChange = Omit<Edit, "live">;

export type PagePreview =
  | { page_id: bigint; missing: true }
  | {
      page_id: bigint;
      missing: false;
      title: string;
      description: string | undefined;
      summary: string;
      thumbnail: Thumbnail | undefined;
    };

// The wire shapes, as returned with formatversion=2. Hidden or suppressed
// revisions omit fields, so everything is optional.
type RawRecentChange = {
  rcid: number;
  pageid?: number;
  revid?: number;
  old_revid?: number;
  title?: string;
  user?: string;
  bot?: boolean;
  minor?: boolean;
  new?: boolean;
  temp?: boolean;
  redirect?: boolean;
  oldlen?: number;
  newlen?: number;
  comment?: string;
  tags?: string[];
  timestamp: string;
};

type RawPage = {
  pageid?: number;
  title?: string;
  missing?: boolean;
  invalid?: boolean;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
};

type RawResponse = {
  error?: { code: string; info: string };
  continue?: Params;
  query?: { recentchanges?: RawRecentChange[]; pages?: RawPage[] };
};

// Fetches article edits and page creations made at or after `start`, oldest
// first, following continuation for at most `maxPages` requests. When the cap
// is hit the caller simply resumes from the newest change it received.
export function fetchRecentChanges(
  http: Http,
  agent: string,
  start: Timestamp,
  maxPages: number,
): RecentChange[] {
  const base: Params = {
    action: "query",
    list: "recentchanges",
    rcdir: "newer",
    rcstart: toMediaWikiTimestamp(start),
    rcnamespace: "0",
    rctype: "edit|new",
    rcprop: "title|ids|sizes|flags|user|timestamp|comment|tags|redirect",
    rclimit: RC_PAGE_SIZE,
  };

  const changes: RecentChange[] = [];
  let continuation: Params | undefined = {};
  for (let page = 0; page < maxPages && continuation; page++) {
    const body = apiGet(http, agent, { ...base, ...continuation });
    for (const rc of body.query?.recentchanges ?? []) {
      changes.push(parseRecentChange(rc));
    }
    continuation = body.continue;
  }
  return changes;
}

// Fetches hover-card data for up to PREVIEW_BATCH_SIZE pages in one request.
export function fetchPreviews(
  http: Http,
  agent: string,
  pageIds: bigint[],
): PagePreview[] {
  if (pageIds.length > PREVIEW_BATCH_SIZE) {
    throw new Error(`At most ${PREVIEW_BATCH_SIZE} pages per preview request`);
  }
  const body = apiGet(http, agent, {
    action: "query",
    prop: "extracts|pageimages|description",
    pageids: pageIds.join("|"),
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: String(PREVIEW_BATCH_SIZE),
    piprop: "thumbnail",
    pithumbsize: "320",
    pilimit: String(PREVIEW_BATCH_SIZE),
  });
  return (body.query?.pages ?? []).flatMap(parsePage);
}

function apiGet(http: Http, agent: string, params: Params): RawResponse {
  const query = encodeQuery({
    ...params,
    format: "json",
    formatversion: "2",
    maxlag: MAX_LAG_SECONDS,
  });
  const response = http.fetch(`${API_URL}?${query}`, {
    headers: { "User-Agent": agent },
    timeout: REQUEST_TIMEOUT,
  });
  if (response.status !== 200) {
    throw new Error(
      `HTTP ${response.status} from ${params.list ?? params.prop}`,
    );
  }
  // MediaWiki reports API errors (including maxlag) with HTTP 200.
  const body = JSON.parse(response.text()) as RawResponse;
  if (body.error) {
    throw new Error(`${body.error.code}: ${body.error.info}`);
  }
  return body;
}

function parseRecentChange(rc: RawRecentChange): RecentChange {
  return {
    rc_id: BigInt(rc.rcid),
    page_id: BigInt(rc.pageid ?? 0),
    rev_id: BigInt(rc.revid ?? 0),
    old_rev_id: BigInt(rc.old_revid ?? 0),
    title: rc.title ?? "",
    user_name: rc.user ?? "",
    is_bot: rc.bot === true,
    is_minor: rc.minor === true,
    is_new: rc.new === true,
    is_temp: rc.temp === true,
    is_redirect: rc.redirect === true,
    old_len: rc.oldlen ?? 0,
    new_len: rc.newlen ?? 0,
    comment: rc.comment ?? "",
    tags: rc.tags ?? [],
    edited_at: Timestamp.fromDate(new Date(rc.timestamp)),
  };
}

function parsePage(page: RawPage): PagePreview[] {
  if (page.pageid === undefined) return [];
  const page_id = BigInt(page.pageid);
  if (page.missing || page.invalid) return [{ page_id, missing: true }];
  return [
    {
      page_id,
      missing: false,
      title: page.title ?? "",
      description: page.description,
      summary: page.extract ?? "",
      thumbnail: page.thumbnail && {
        url: page.thumbnail.source,
        width: page.thumbnail.width,
        height: page.thumbnail.height,
      },
    },
  ];
}

// MediaWiki accepts ISO 8601, but not with fractional seconds.
function toMediaWikiTimestamp(ts: Timestamp): string {
  return ts
    .toDate()
    .toISOString()
    .replace(/\.\d+Z$/, "Z");
}

// URLSearchParams isn't guaranteed in the module runtime; this is plain ECMAScript.
function encodeQuery(params: Params): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
