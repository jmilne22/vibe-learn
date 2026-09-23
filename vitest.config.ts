import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/v2/**/*.test.ts"], testTimeout: 20000 },
});
