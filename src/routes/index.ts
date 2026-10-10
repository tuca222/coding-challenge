import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { reportRoutes } from "./reportRoutes.js";

export const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/reports", reportRoutes);
