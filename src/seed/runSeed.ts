import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { ensureIndexes } from "../db/connect.js";
import { InventoryItem } from "../models/InventoryItem.js";
import { User } from "../models/User.js";
import { seedUsers } from "./seedData.js";

export interface SeedSummary {
  users: number;
  items: number;
}

// Idempotent: users keep their _id; their items are replaced.
// Not transactional; running it again restores the documented state.
export async function runSeed(): Promise<SeedSummary> {
  await ensureIndexes();
  let items = 0;
  for (const seedUser of seedUsers) {
    const passwordHash = await bcrypt.hash(seedUser.password, env.BCRYPT_COST);
    const user = await User.findOneAndUpdate(
      { email: seedUser.email },
      { $set: { name: seedUser.name, passwordHash } },
      { upsert: true, returnDocument: "after" },
    );
    await InventoryItem.deleteMany({ userId: user._id });
    if (seedUser.items.length > 0) {
      await InventoryItem.insertMany(seedUser.items.map((i) => ({ ...i, userId: user._id })));
    }
    items += seedUser.items.length;
  }
  return { users: seedUsers.length, items };
}
