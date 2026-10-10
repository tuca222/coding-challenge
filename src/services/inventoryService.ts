import { InventoryItem } from "../models/InventoryItem.js";
import { toInventoryItemDto, type InventoryItemDto } from "../dto/inventoryItemDto.js";

// The owner filter is part of the query (plan §7.4).
export async function listInventory(userId: string): Promise<InventoryItemDto[]> {
  const items = await InventoryItem.find({ userId }).lean();
  return items.map(toInventoryItemDto);
}
