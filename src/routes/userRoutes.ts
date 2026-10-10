import { Router } from "express";
import { getMeHandler } from "../controllers/userController.js";
import { authenticate } from "../middleware/authenticate.js";
import { jsonBody } from "../middleware/jsonBody.js";

export const userRoutes: Router = Router();

userRoutes.get("/me", authenticate, jsonBody, getMeHandler);
