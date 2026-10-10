import type { Types } from "mongoose";
import { centsToDollars } from "../utils/money.js";

export interface InventoryItemDto {
  id: string;
  name: string;
  sku: string;
  category: string;
  location: string;
  quantity: number;
  unitPrice: number;
}

export function toInventoryItemDto(item: {
  _id: Types.ObjectId;
  name: string;
  sku: string;
  category: string;
  location: string;
  quantity: number;
  unitPriceCents: number;
}): InventoryItemDto {
  return {
    id: item._id.toHexString(),
    name: item.name,
    sku: item.sku,
    category: item.category,
    location: item.location,
    quantity: item.quantity,
    unitPrice: centsToDollars(item.unitPriceCents),
  };
}
