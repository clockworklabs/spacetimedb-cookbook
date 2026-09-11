#!/usr/bin/env bash
# Stores WIKIWATCH_CONTACT (from .env.local, or the environment) in the
# database's private `settings` table. The module puts it in the User-Agent it
# sends to Wikipedia, as Wikimedia's policy asks, without it ever appearing in
# the source, the module bundle or version control.
#
# usage: scripts/set-contact.sh [database] [server]
#   database  defaults to SPACETIMEDB_DB_NAME from .env.local
#   server    a nickname (e.g. local) or URL; defaults to SPACETIMEDB_HOST
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() {
  grep -E "^$1=" .env.local 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

contact=${WIKIWATCH_CONTACT:-$(env_value WIKIWATCH_CONTACT)}
database=${1:-$(env_value SPACETIMEDB_DB_NAME)}
server=${2:-$(env_value SPACETIMEDB_HOST | sed -E 's#^wss://#https://#; s#^ws://#http://#')}

if [[ -z "$contact" ]]; then
  echo "Set WIKIWATCH_CONTACT in .env.local first: an email address or URL." >&2
  exit 1
fi
if [[ -z "$database" || -z "$server" ]]; then
  echo "usage: $0 [database] [server]" >&2
  exit 1
fi

# --no-config: spacetime.local.json would otherwise override the database name.
sql() { spacetime sql --no-config "$database" --server "$server" "$1"; }

sql "DELETE FROM settings WHERE id = 0"
sql "INSERT INTO settings (id, wikipedia_contact) VALUES (0, '${contact//\'/\'\'}')"
sql "SELECT wikipedia_contact FROM settings"
