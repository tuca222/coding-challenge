import bcrypt from "bcrypt";
import type { Express } from "express";
import request from "supertest";
import type { Types } from "mongoose";
import { env } from "../src/config/env.js";
import { InventoryItem } from "../src/models/InventoryItem.js";
import { User } from "../src/models/User.js";
import { signToken } from "../src/services/authService.js";

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
}

let counter = 0;

export async function createUser(
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<CreatedUser> {
  counter++;
  const email = overrides.email ?? `user${counter}@example.com`;
  const password = overrides.password ?? "password123";
  const user = await User.create({
    name: overrides.name ?? `User ${counter}`,
    email,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_COST),
  });
  return { id: String(user._id), email: user.email, password };
}

export async function createItems(
  userId: string | Types.ObjectId,
  n: number,
): Promise<void> {
  const docs = Array.from({ length: n }, (_, i) => ({
    userId,
    name: `Item ${i + 1}`,
    sku: `SKU-${i + 1}`,
    category: "Tools",
    location: "A1",
    quantity: i + 1,
    unitPriceCents: 1000 + i,
  }));
  await InventoryItem.insertMany(docs);
}

export async function loginAs(
  app: Express,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  return (res.body as { token: string }).token;
}

export function tokenFor(userId: string | Types.ObjectId): string {
  return signToken(String(userId));
}
