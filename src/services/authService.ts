import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../errors/AppError.js";

export function signToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  });
}

export function verifyToken(token: string): string {
  let payload: unknown;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError();
  }
  if (typeof payload === "object" && payload !== null) {
    const sub = (payload as { sub?: unknown }).sub;
    if (typeof sub === "string" && /^[0-9a-f]{24}$/i.test(sub)) return sub;
  }
  throw new UnauthorizedError();
}

let dummyHash: Promise<string> | undefined;

// Memoized: used to equalize login timing for unknown emails.
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), env.BCRYPT_COST);
  return dummyHash;
}
