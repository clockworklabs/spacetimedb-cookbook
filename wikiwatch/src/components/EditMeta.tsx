import type { Edit } from "../module_bindings/types";
import { contributionsUrl } from "../wikipedia";

// The edit's author, linked to their contributions on Wikipedia.
export function EditUser({ edit }: { edit: Edit }) {
  if (!edit.userName) return <span className="entry-user">Hidden user</span>;
  return (
    <a
      className="entry-user"
      href={contributionsUrl(edit.userName)}
      target="_blank"
      rel="noreferrer"
    >
      {edit.userName}
    </a>
  );
}

// Badges for what kind of edit it was. `all` adds the rarer ones, for pages
// with room to spare.
export function EditFlags({
  edit,
  all = false,
}: {
  edit: Edit;
  all?: boolean;
}) {
  const flags = [
    edit.isNew && "created the article",
    edit.isBot && "bot",
    edit.isMinor && "minor",
    all && edit.isTemp && "temporary account",
    all && edit.isRedirect && "redirect",
  ].filter((flag) => typeof flag === "string");

  return flags.map((flag) => (
    <span key={flag} className="entry-flag">
      {flag}
    </span>
  ));
}
