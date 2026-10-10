import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { InventoryItem } from "../src/models/InventoryItem.js";
import { writeInventoryReport } from "../src/workers/spreadsheet.js";

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function item(userId: Types.ObjectId, sku: string, quantity = 3, unitPriceCents = 1999): Record<string, unknown> {
  return { userId, name: `Name ${sku}`, sku, category: "Tools", location: "A1", quantity, unitPriceCents };
}

async function run(userId: Types.ObjectId): Promise<{ count: number; sheet: ExcelJS.Worksheet }> {
  dir = await mkdtemp(join(tmpdir(), "t25-"));
  const file = join(dir, "r.xlsx");
  const count = await writeInventoryReport(userId, file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return { count, sheet: wb.worksheets[0] };
}

describe("writeInventoryReport", () => {
  it("writes the 7 headers in order", async () => {
    await InventoryItem.create(item(userA, "A-1"));
    const { sheet } = await run(userA);
    const values = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(values).toEqual(["Name", "SKU", "Category", "Location", "Quantity", "Unit Price", "Total Value"]);
  });

  it("writes only the user's items, in dollars, with Total Value", async () => {
    await InventoryItem.create(item(userA, "A-1"));
    await InventoryItem.create(item(userA, "A-2", 1, 500));
    await InventoryItem.create(item(userB, "B-1"));
    const { count, sheet } = await run(userA);
    expect(count).toBe(2);
    expect(sheet.rowCount).toBe(3);
    const skus = [sheet.getRow(2).getCell(2).value, sheet.getRow(3).getCell(2).value];
    expect(skus.sort()).toEqual(["A-1", "A-2"]);
    const row = [2, 3].map((n) => sheet.getRow(n)).find((r) => r.getCell(2).value === "A-1")!;
    expect(row.getCell(5).value).toBe(3);
    expect(row.getCell(6).value).toBe(19.99);
    expect(row.getCell(7).value).toBe(59.97);
  });

  it("has no _id or userId in any cell", async () => {
    const doc = await InventoryItem.create(item(userA, "A-1"));
    const { sheet } = await run(userA);
    const all: string[] = [];
    sheet.eachRow((r) => r.eachCell((c) => all.push(JSON.stringify(c.value))));
    expect(all).not.toContain(JSON.stringify(String(doc._id)));
    expect(all).not.toContain(JSON.stringify(String(userA)));
    expect(sheet.columnCount).toBe(7);
  });

  it("returns 0 for a user without items", async () => {
    const { count } = await run(userA);
    expect(count).toBe(0);
  });
});
