import { beforeAll, describe, expect, it } from "vitest";
import { User } from "../src/models/User.js";

const valid = { name: "Ann", email: "ann@example.com", passwordHash: "hash" };

describe("User model", () => {
  beforeAll(async () => {
    await User.init();
  });

  it("stores email trimmed and lowercased", async () => {
    const u = await User.create({ ...valid, email: "  Ann@Example.COM " });
    expect(u.email).toBe("ann@example.com");
  });

  it("rejects duplicate email with different case", async () => {
    await User.create(valid);
    await expect(User.create({ ...valid, email: "ANN@example.com" })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("hides passwordHash unless selected", async () => {
    await User.create(valid);
    const plain = await User.findOne({ email: valid.email }).lean();
    expect(plain?.passwordHash).toBeUndefined();
    const withHash = await User.findOne({ email: valid.email }).select("+passwordHash").lean();
    expect(withHash?.passwordHash).toBe("hash");
  });

  it.each(["name", "email", "passwordHash"] as const)("requires %s", async (field) => {
    const data: Partial<typeof valid> = { ...valid };
    delete data[field];
    await expect(User.create(data)).rejects.toThrow(/validation failed/i);
  });

  it("sets createdAt and updatedAt", async () => {
    const u = await User.create(valid);
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
  });
});
