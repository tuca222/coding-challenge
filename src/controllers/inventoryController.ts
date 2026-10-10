import type { Request, Response } from "express";
import { getAuth } from "../middleware/authenticate.js";
import { listInventory } from "../services/inventoryService.js";

// Reads nothing from query, body, params or headers; only req.auth.
export async function listInventoryHandler(req: Request, res: Response): Promise<void> {
  const { userId } = getAuth(req);
  res.status(200).json(await listInventory(userId));
}
