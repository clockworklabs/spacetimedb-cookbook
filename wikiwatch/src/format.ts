const numbers = new Intl.NumberFormat("en-GB");

export function formatNumber(count: number): string {
  return numbers.format(count);
}

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

// Short enough to sit in a narrow column: "just now", "4 min ago", "2 hr ago".
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

// Wikipedia tags a phone edit up to three times over ("mobile edit", "mobile
// web edit", "advanced mobile edit"). Those all say one thing: "mobile".
export function displayTags(tags: readonly string[]): string[] {
  return [
    ...new Set(tags.map((tag) => (/mobile/i.test(tag) ? "mobile" : tag))),
  ];
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
