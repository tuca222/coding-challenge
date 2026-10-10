import type { Request, Response } from "express";
import { getAuth } from "../middleware/authenticate.js";
import { getProfile } from "../services/userService.js";

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getProfile(getAuth(req).userId));
}
