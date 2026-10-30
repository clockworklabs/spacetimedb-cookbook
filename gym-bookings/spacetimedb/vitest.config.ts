import { defineConfig } from "vitest/config";
import { spacetimedbModuleTestPlugin } from "spacetimedb/server/test-utils/vitest";

export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin()],
  test: { environment: "node" },
});
