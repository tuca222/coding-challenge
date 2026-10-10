import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { userRoutes } from "./userRoutes.js";
import { inventoryRoutes } from "./inventoryRoutes.js";
import { reportRoutes } from "./reportRoutes.js";

export const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/reports", reportRoutes);
