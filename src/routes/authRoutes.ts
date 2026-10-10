import { Router } from "express";
import { loginHandler } from "../controllers/authController.js";
import { jsonBody } from "../middleware/jsonBody.js";

export const authRoutes: Router = Router();

authRoutes.post("/login", jsonBody, loginHandler);
