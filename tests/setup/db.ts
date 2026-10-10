import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { connectDb, disconnectDb } from "../../src/db/connect.js";

beforeAll(async () => {
  await connectDb(inject("mongoUri"));
});

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDb();
});
