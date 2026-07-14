import { defineConfig } from "vitest/config";

// The model core in src/model + src/storage/serialize is pure (no DOM, no I/O),
// so tests run in a plain Node environment. Test files live next to the code
// they exercise as *.test.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
