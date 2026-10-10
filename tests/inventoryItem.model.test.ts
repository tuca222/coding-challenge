import { Types } from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";
import { InventoryItem } from "../src/models/InventoryItem.js";

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: userA,
    name: "Widget",
    sku: "W-1",
    category: "Tools",
    location: "A1",
    quantity: 5,
    unitPriceCents: 1999,
    ...overrides,
  };
}

describe("InventoryItem model", () => {
  beforeAll(async () => {
    await InventoryItem.init();
  });

  it("saves a valid item with timestamps", async () => {
    const item = await InventoryItem.create(valid());
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects the same sku for the same user", async () => {
    await InventoryItem.create(valid());
    await expect(InventoryItem.create(valid())).rejects.toMatchObject({ code: 11000 });
  });

  it("accepts the same sku for two users", async () => {
    await InventoryItem.create(valid());
    await InventoryItem.create(valid({ userId: userB }));
    expect(await InventoryItem.countDocuments()).toBe(2);
  });

  it.each(["name", "sku", "category", "location"])("rejects empty %s", async (field) => {
    await expect(InventoryItem.create(valid({ [field]: "" }))).rejects.toThrow(/validation/i);
    await expect(InventoryItem.create(valid({ [field]: "   " }))).rejects.toThrow(/validation/i);
  });

  it.each(["quantity", "unitPriceCents"])("rejects negative or non-integer %s", async (field) => {
    await expect(InventoryItem.create(valid({ [field]: -1 }))).rejects.toThrow(/validation/i);
    await expect(InventoryItem.create(valid({ [field]: 1.5 }))).rejects.toThrow(/validation/i);
  });
});
