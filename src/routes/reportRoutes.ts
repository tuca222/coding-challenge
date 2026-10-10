import { Router } from "express";
import { createInventoryReport, getReport } from "../controllers/reportController.js";
import { authenticate } from "../middleware/authenticate.js";
import { jsonBody } from "../middleware/jsonBody.js";

export const reportRoutes: Router = Router();

reportRoutes.post("/inventory", authenticate, jsonBody, createInventoryReport);
reportRoutes.get("/:jobId", authenticate, getReport);
