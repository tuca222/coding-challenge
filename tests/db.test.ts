import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { ensureIndexes } from "../src/db/connect.js";

async function keys(collection: string): Promise<string[]> {
  const idx = await mongoose.connection.collection(collection).indexes();
  return idx.map((i) => JSON.stringify(i.key));
}

describe("ensureIndexes", () => {
  it("creates the indexes of plan section 5", async () => {
    await ensureIndexes();
    expect(await keys("users")).toContain(JSON.stringify({ email: 1 }));
    expect(await keys("inventory")).toContain(JSON.stringify({ userId: 1, sku: 1 }));
    const jobs = await keys("reportJobs");
    expect(jobs).toContain(JSON.stringify({ status: 1, createdAt: 1 }));
    expect(jobs).toContain(JSON.stringify({ status: 1, lockedUntil: 1 }));
  });
});
