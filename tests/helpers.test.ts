import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { InventoryItem } from "../src/models/InventoryItem.js";
import { User } from "../src/models/User.js";
import { verifyToken } from "../src/services/authService.js";
import { createItems, createUser, tokenFor } from "./helpers.js";

describe("test helpers", () => {
  it("createUser stores a bcrypt hash, not the plain password", async () => {
    const u = await createUser({ password: "secret-pw" });
    const doc = await User.findById(u.id).select("+passwordHash").lean();
    expect(doc?.passwordHash).not.toBe("secret-pw");
    expect(await bcrypt.compare("secret-pw", doc?.passwordHash ?? "")).toBe(true);
  });

  it("createItems creates n items owned by the user", async () => {
    const a = await createUser();
    const b = await createUser();
    await createItems(a.id, 3);
    expect(await InventoryItem.countDocuments({ userId: a.id })).toBe(3);
    expect(await InventoryItem.countDocuments({ userId: b.id })).toBe(0);
  });

  it("tokenFor returns a token verifyToken accepts", async () => {
    const u = await createUser();
    expect(verifyToken(tokenFor(u.id))).toBe(u.id);
  });
});
