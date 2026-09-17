import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" lanza fuera de React Server Components; en pruebas no aplica.
      "server-only": fileURLToPath(new URL("./tests/stubs/vacio.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      BETTER_AUTH_SECRET: "secreto-solo-para-pruebas-0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
