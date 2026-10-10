import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { inventoryRoutes } from "./inventoryRoutes.js";

export const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/inventory", inventoryRoutes);
