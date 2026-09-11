import type { Edit } from "../module_bindings/types";

const WIKIPEDIA = "https://en.wikipedia.org";

export function articleUrl(pageId: bigint): string {
  return `${WIKIPEDIA}/?curid=${pageId}`;
}

export function diffUrl(edit: Edit): string {
  return edit.oldRevId === 0n
    ? `${WIKIPEDIA}/w/index.php?oldid=${edit.revId}`
    : `${WIKIPEDIA}/w/index.php?diff=${edit.revId}&oldid=${edit.oldRevId}`;
}

const numbers = new Intl.NumberFormat("en-GB");

export function formatDelta(bytes: number): string {
  if (bytes > 0) return `+${numbers.format(bytes)}`;
  if (bytes < 0) return `−${numbers.format(-bytes)}`;
  return "0";
}

export function deltaClass(bytes: number): string {
  return bytes > 0 ? "added" : bytes < 0 ? "removed" : "neutral";
}

const clockTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatClock(ms: number): string {
  return clockTime.format(ms);
}

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute ago";
  if (minutes < 60) return relative.format(-minutes, "minute");
  return relative.format(-Math.floor(minutes / 60), "hour");
}

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
) {
  return `${numbers.format(count)} ${count === 1 ? singular : pluralForm}`;
}

// Edit summaries are raw wikitext-ish: "/* Early life */ fixed [[Foo|a link]]".
// Pull out the section being edited and flatten links and bold/italic quotes.
export function parseComment(raw: string): { section?: string; text: string } {
  const match = raw.match(/^\s*\/\*\s*(.*?)\s*\*\/\s*/);
  const section = match?.[1] ? flatten(match[1]) : undefined;
  const text = flatten(match ? raw.slice(match[0].length) : raw);
  return { section, text };
}

function flatten(wikitext: string): string {
  return wikitext
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .trim();
}
