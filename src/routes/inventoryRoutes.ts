import { Router } from "express";
import { listInventoryHandler } from "../controllers/inventoryController.js";
import { authenticate } from "../middleware/authenticate.js";
import { jsonBody } from "../middleware/jsonBody.js";

export const inventoryRoutes: Router = Router();

inventoryRoutes.get("/", authenticate, jsonBody, listInventoryHandler);
