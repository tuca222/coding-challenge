import type { Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../errors/AppError.js";
import { login } from "../services/authService.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "body";
    throw new ValidationError(`${field}: ${issue?.message ?? "Invalid input"}`);
  }
  const token = await login(parsed.data.email, parsed.data.password);
  res.status(200).json({ token });
}
