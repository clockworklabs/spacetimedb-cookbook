import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, ErrorContext } from "./module_bindings/index.ts";
import { DEBUG } from "./debug/enabled.ts";
import { countWebSocketBytes } from "./debug/wireStats.ts";

// Before the connection opens its socket, so every frame is counted.
if (DEBUG) countWebSocketBytes();

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "wikiwatch-dev";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const onConnect = (_conn: DbConnection, identity: Identity, token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  console.log(
    "Connected to SpacetimeDB with identity:",
    identity.toHexString(),
  );
};

const onDisconnect = () => {
  console.log("Disconnected from SpacetimeDB");
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.log("Error connecting to SpacetimeDB:", err);
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect(onConnect)
  .onDisconnect(onDisconnect)
  .onConnectError(onConnectError);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>,
);
