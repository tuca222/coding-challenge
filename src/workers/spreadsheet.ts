import ExcelJS from "exceljs";
import type { Types } from "mongoose";
import { InventoryItem } from "../models/InventoryItem.js";
import { centsToDollars } from "../utils/money.js";

const MONEY_FORMAT = "0.00";

// Streams the user's items to an .xlsx file; returns the number of item rows.
export async function writeInventoryReport(
  userId: Types.ObjectId | string,
  filePath: string,
): Promise<number> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath });
  const sheet = workbook.addWorksheet("Inventory");
  sheet.columns = [
    { header: "Name", key: "name" },
    { header: "SKU", key: "sku" },
    { header: "Category", key: "category" },
    { header: "Location", key: "location" },
    { header: "Quantity", key: "quantity", style: { numFmt: "0" } },
    { header: "Unit Price", key: "unitPrice", style: { numFmt: MONEY_FORMAT } },
    { header: "Total Value", key: "totalValue", style: { numFmt: MONEY_FORMAT } },
  ];

  let count = 0;
  const cursor = InventoryItem.find({ userId }).lean().cursor();
  for await (const item of cursor) {
    sheet
      .addRow({
        name: item.name,
        sku: item.sku,
        category: item.category,
        location: item.location,
        quantity: item.quantity,
        unitPrice: centsToDollars(item.unitPriceCents),
        totalValue: centsToDollars(item.quantity * item.unitPriceCents),
      })
      .commit();
    count++;
  }

  sheet.commit();
  await workbook.commit();
  return count;
}
