import { Router } from "express";
import { authRoutes } from "./authRoutes.js";

export const router: Router = Router();

router.use("/auth", authRoutes);
