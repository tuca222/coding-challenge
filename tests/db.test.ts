import mongoose from "mongoose";
import { describe, expect, inject, it } from "vitest";
import { connectDb, disconnectDb } from "../src/db/connect.js";

describe("db connection", () => {
  it("is connected by the test setup", () => {
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("disconnects and reconnects", async () => {
    await disconnectDb();
    expect(mongoose.connection.readyState).toBe(0);
    await connectDb(inject("mongoUri"));
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("writes a document", async () => {
    await mongoose.connection.collection("tmp").insertOne({ a: 1 });
    expect(await mongoose.connection.collection("tmp").countDocuments()).toBe(1);
  });

  it("clears collections between tests", async () => {
    expect(await mongoose.connection.collection("tmp").countDocuments()).toBe(0);
  });
});
