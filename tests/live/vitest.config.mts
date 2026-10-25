import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Live suites only: they call a running console (and, through it, the real
 * services), so `make check` and CI never pick them up. Rooted at the repo,
 * like the unit config, so paths and reports resolve the same way. */
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 900_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
});
