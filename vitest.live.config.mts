import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Live suites only: they call a running console (and, through it, the real
 * services), so `make check` and CI never pick them up. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.live.test.ts"],
    testTimeout: 900_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
