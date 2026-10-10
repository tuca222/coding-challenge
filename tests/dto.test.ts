import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { toInventoryItemDto } from "../src/dto/inventoryItemDto.js";
import { toReportJobDto } from "../src/dto/reportJobDto.js";
import { toUserDto } from "../src/dto/userDto.js";

const _id = new Types.ObjectId();
const userId = new Types.ObjectId();
const d1 = new Date("2026-01-01T00:00:00.000Z");
const d2 = new Date("2026-01-02T00:00:00.000Z");

describe("toUserDto", () => {
  it("returns only id, name, email, createdAt", () => {
    const input = { _id, name: "A", email: "a@x.io", createdAt: d1, passwordHash: "secret" };
    expect(toUserDto(input)).toEqual({ id: _id.toHexString(), name: "A", email: "a@x.io", createdAt: d1.toISOString() });
  });
});

describe("toInventoryItemDto", () => {
  it("returns id and business fields with dollars, no userId", () => {
    const input = { _id, userId, name: "n", sku: "s", category: "c", location: "l", quantity: 3, unitPriceCents: 1999 };
    const dto = toInventoryItemDto(input);
    expect(dto).toEqual({ id: _id.toHexString(), name: "n", sku: "s", category: "c", location: "l", quantity: 3, unitPrice: 19.99 });
    expect(dto).not.toHaveProperty("userId");
  });
});

describe("toReportJobDto", () => {
  const base = {
    _id, userId, status: "pending", createdAt: d1, statusChangedAt: d2,
    attempts: 1, lockToken: "t", lockedUntil: d2, reason: null,
  };
  it("omits reason when null and hides internals", () => {
    expect(toReportJobDto(base)).toEqual({
      jobId: _id.toHexString(), status: "pending", createdAt: d1.toISOString(), updatedAt: d2.toISOString(),
    });
  });
  it("includes reason when set", () => {
    expect(toReportJobDto({ ...base, status: "failed", reason: "boom" })).toHaveProperty("reason", "boom");
  });
});
