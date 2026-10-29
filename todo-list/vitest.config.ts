import { defineConfig } from "vitest/config";
import { spacetimedbModuleTestPlugin } from "spacetimedb/server/test-utils/vitest";

export default defineConfig({
  test: {
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "frontend",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      // Module unit tests run against an in-memory datastore (SpacetimeDB's
      // own, compiled to wasm). The plugin stands in for the `spacetime:sys`
      // host imports, which only exist inside a real database, and inlines
      // the SDK, which imports them too.
      {
        root: "spacetimedb",
        plugins: [spacetimedbModuleTestPlugin()],
        test: {
          name: "backend",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
    // There are no frontend tests yet.
    passWithNoTests: true,
  },
});
