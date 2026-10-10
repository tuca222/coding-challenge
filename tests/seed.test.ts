import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { InventoryItem } from "../src/models/InventoryItem.js";
import { ReportJob } from "../src/models/ReportJob.js";
import { User } from "../src/models/User.js";
import { seedUsers } from "../src/seed/seedData.js";
import { runSeed } from "../src/seed/runSeed.js";

async function userByEmail(email: string) {
  const u = await User.findOne({ email }).select("+passwordHash");
  if (!u) throw new Error(`missing ${email}`);
  return u;
}

describe("runSeed", () => {
  it("creates users with the documented item counts and fields", async () => {
    await runSeed();
    const counts: Record<string, number> = {};
    for (const s of seedUsers) {
      const u = await userByEmail(s.email);
      counts[s.email] = await InventoryItem.countDocuments({ userId: u._id });
    }
    expect(counts).toEqual({
      "alice@example.com": 10,
      "bob@example.com": 8,
      "carol@example.com": 0,
    });
    const items = await InventoryItem.find().lean();
    for (const i of items) {
      for (const f of ["name", "sku", "category", "location", "quantity", "unitPriceCents"]) {
        expect(i).toHaveProperty(f);
      }
    }
    const alice = await userByEmail("alice@example.com");
    const bob = await userByEmail("bob@example.com");
    const aSkus = (await InventoryItem.find({ userId: alice._id })).map((i) => i.sku);
    const bSkus = (await InventoryItem.find({ userId: bob._id })).map((i) => i.sku);
    expect(aSkus.filter((s) => bSkus.includes(s)).length).toBeGreaterThanOrEqual(1);
  });

  it("stores bcrypt hashes that match the documented passwords", async () => {
    await runSeed();
    for (const s of seedUsers) {
      const u = await userByEmail(s.email);
      expect(u.passwordHash).not.toBe(s.password);
      expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(s.password, u.passwordHash)).toBe(true);
    }
  });

  it("is idempotent and leaves jobs and other users alone", async () => {
    await runSeed();
    const before = await User.find().lean();
    const other = await User.create({ name: "Other", email: "other@example.com", passwordHash: "x" });
    const job = await ReportJob.create({ userId: other._id, statusChangedAt: new Date() });
    const jobBefore = await ReportJob.findById(job._id).lean();

    await runSeed();

    const after = await User.find({ email: { $in: seedUsers.map((s) => s.email) } }).lean();
    expect(after.map((u) => String(u._id)).sort()).toEqual(before.map((u) => String(u._id)).sort());
    expect(await InventoryItem.countDocuments()).toBe(18);
    expect(await ReportJob.findById(job._id).lean()).toEqual(jobBefore);
    const o = await User.findById(other._id).select("+passwordHash").lean();
    expect(o?.name).toBe("Other");
    expect(o?.passwordHash).toBe("x");
  });
});
