import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
    globalSetup: ["tests/setup/globalSetup.ts"],
    setupFiles: ["tests/setup/db.ts"],
    fileParallelism: false,
    env: {
      JWT_SECRET: "test-secret-test-secret-test-secret",
      MONGO_URI: "mongodb://placeholder:27017/test",
      BCRYPT_COST: "4",
    },
  },
});
