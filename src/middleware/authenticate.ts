import type { NextFunction, Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "../errors/AppError.js";
import { verifyToken } from "../services/authService.js";
import { userExists } from "../services/userService.js";

const BEARER = /^Bearer (\S+)$/i;

export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const match = BEARER.exec(req.headers.authorization ?? "");
    if (!match?.[1]) throw new UnauthorizedError();
    const userId = verifyToken(match[1]);
    if (!(await userExists(userId))) throw new UnauthorizedError();
    req.auth = { userId };
    next();
  } catch (err) {
    next(err);
  }
};

// Fails closed if a protected route was mounted without `authenticate`.
export function getAuth(req: Request): { userId: string } {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
