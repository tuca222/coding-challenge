import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/setup/globalSetup.ts"],
    fileParallelism: false,
    env: {
      JWT_SECRET: "test-secret-test-secret-test-secret",
      MONGO_URI: "mongodb://placeholder:27017/test",
      BCRYPT_COST: "4",
    },
  },
});
