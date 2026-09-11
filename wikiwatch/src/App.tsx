import { tables } from "./module_bindings";
import { useSpacetimeDB, useTable } from "spacetimedb/react";

// Placeholder until the real UI is built: shows the poller is alive.
function App() {
  const { isActive: connected } = useSpacetimeDB();
  const [statuses] = useTable(tables.pollerStatus);
  const status = statuses[0];

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>wikiwatch</h1>
      <p>{connected ? "Connected" : "Disconnected"}</p>
      {status && (
        <p>
          {String(status.editsIngested)} edits ingested, up to{" "}
          {status.cursor.toDate().toISOString()}
          {status.lastError && <> (last error: {status.lastError})</>}
        </p>
      )}
    </div>
  );
}

export default App;
