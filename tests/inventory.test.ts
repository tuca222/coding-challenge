import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InventoryItem } from "../src/models/InventoryItem.js";
import { createItems, createUser, tokenFor } from "./helpers.js";

const app = createApp();
const bearer = (id: string): string => `Bearer ${tokenFor(id)}`;

describe("GET /inventory", () => {
  it("returns only the caller's items with exact fields and dollars", async () => {
    const a = await createUser();
    const b = await createUser();
    await createItems(a.id, 3);
    await createItems(b.id, 2);
    const res = await request(app).get("/inventory").set("Authorization", bearer(a.id));
    const items = res.body as Record<string, unknown>[];
    expect(res.status).toBe(200);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        "category",
        "id",
        "location",
        "name",
        "quantity",
        "sku",
        "unitPrice",
      ]);
    }
    expect(items.find((i) => i.sku === "SKU-1")?.unitPrice).toBe(10);
    const bIds = (await InventoryItem.find({ userId: b.id })).map((i) => String(i._id));
    for (const item of items) expect(bIds).not.toContain(item.id);
  });

  it("ignores another user's ids in query, body and header", async () => {
    const a = await createUser();
    const b = await createUser();
    await createItems(a.id, 2);
    await createItems(b.id, 2);
    const bItemId = String((await InventoryItem.findOne({ userId: b.id }))?._id);
    const plain = await request(app).get("/inventory").set("Authorization", bearer(a.id));
    const tampered = await request(app)
      .get(`/inventory?userId=${b.id}&id=${bItemId}`)
      .set("Authorization", bearer(a.id))
      .set("X-User-Id", b.id)
      .send({ userId: b.id, id: bItemId });
    expect(tampered.status).toBe(200);
    expect(tampered.body).toEqual(plain.body);
  });

  it("returns 404 for another user's item id path", async () => {
    const a = await createUser();
    const b = await createUser();
    await createItems(b.id, 1);
    const bItemId = String((await InventoryItem.findOne({ userId: b.id }))?._id);
    const res = await request(app)
      .get(`/inventory/${bItemId}`)
      .set("Authorization", bearer(a.id));
    expect(res.status).toBe(404);
  });

  it("returns [] for a user without items", async () => {
    const a = await createUser();
    const res = await request(app).get("/inventory").set("Authorization", bearer(a.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects a missing token", async () => {
    const res = await request(app).get("/inventory");
    expect(res.status).toBe(401);
  });
});
