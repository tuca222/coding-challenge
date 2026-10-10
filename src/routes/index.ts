import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { userRoutes } from "./userRoutes.js";

export const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
