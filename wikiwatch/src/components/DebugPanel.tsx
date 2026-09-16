import { useState } from "react";
import { AlgebraicType, BinaryWriter } from "spacetimedb";
import { useSpacetimeDB } from "spacetimedb/react";
import { wireStats } from "../debug/wireStats";
import { formatNumber } from "../live/format";
import { useNow } from "../live/hooks";
import type { DbConnection } from "../module_bindings";
import ArticlePreviewRow from "../module_bindings/article_preview_table";
import EditRow from "../module_bindings/edit_table";
import FetchStatusRow from "../module_bindings/fetch_status_table";

const REFRESH_MS = 1000;

// fetch_event is an event table, so it never holds rows in the cache.
const TABLES = [
  { name: "edit", row: EditRow, rows: (db: Db) => db.edit.iter() },
  {
    name: "article_preview",
    row: ArticlePreviewRow,
    rows: (db: Db) => db.articlePreview.iter(),
  },
  {
    name: "fetch_status",
    row: FetchStatusRow,
    rows: (db: Db) => db.fetchStatus.iter(),
  },
].map((table) => ({
  ...table,
  serialize: AlgebraicType.makeSerializer(table.row.algebraicType),
}));

type Db = DbConnection["db"];

// Cache rows are never mutated in place (an update replaces the row object),
// so each row's size only needs working out once.
const rowSizes = new WeakMap<object, number>();

// A row's size in BSATN, the uncompressed encoding the server sends it in.
function rowSize(
  row: object,
  serialize: ReturnType<typeof AlgebraicType.makeSerializer>,
): number {
  let size = rowSizes.get(row);
  if (size === undefined) {
    const writer = new BinaryWriter(256);
    serialize(writer, row);
    size = writer.offset;
    rowSizes.set(row, size);
  }
  return size;
}

// A corner panel showing how much of each table this client holds, and how
// much the server has sent over the socket.
export function DebugPanel() {
  const { getConnection } = useSpacetimeDB();
  const [open, setOpen] = useState(true);
  useNow(REFRESH_MS);
  const conn = getConnection() as DbConnection | null;

  const stats = TABLES.map(({ name, rows, serialize }) => {
    let count = 0;
    let bytes = 0;
    if (conn) {
      for (const row of rows(conn.db)) {
        count += 1;
        bytes += rowSize(row, serialize);
      }
    }
    return { name, count, bytes };
  });
  const totalBytes = stats.reduce((sum, table) => sum + table.bytes, 0);

  return (
    <aside className="debug-panel">
      <button
        type="button"
        className="debug-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Client cache
      </button>
      {open && (
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(({ name, count, bytes }) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{formatNumber(count)}</td>
                <td>{formatBytes(bytes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>cached total</td>
              <td />
              <td>{formatBytes(totalBytes)}</td>
            </tr>
            <tr>
              <td>received</td>
              <td>{formatNumber(wireStats.messages)} msgs</td>
              <td>{formatBytes(wireStats.bytes)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </aside>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
