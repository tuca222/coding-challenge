import { describe, expect, it, vi } from "vitest";

vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/inventory");
vi.stubEnv("JWT_SECRET", "test-secret");
const { loadEnv } = await import("../src/config/env.js");

const base = { MONGO_URI: "mongodb://mongo:27017/inventory", JWT_SECRET: "s" };

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv(base)).toMatchObject({
      PORT: 3000,
      JWT_EXPIRES_IN_SECONDS: 3600,
      BCRYPT_COST: 12,
      REPORT_MAX_ATTEMPTS: 3,
      REPORT_LEASE_SECONDS: 120,
      WORKER_POLL_INTERVAL_MS: 2000,
      REPORTS_DIR: "/tmp/reports",
    });
  });

  it("throws naming missing required values", () => {
    expect(() => loadEnv({})).toThrow(
      "Missing or invalid config: MONGO_URI, JWT_SECRET",
    );
  });

  it("throws naming a non-numeric number", () => {
    expect(() => loadEnv({ ...base, PORT: "abc" })).toThrow(/PORT/);
  });

  it("converts numeric strings", () => {
    expect(loadEnv({ ...base, PORT: "8080" }).PORT).toBe(8080);
  });
});
