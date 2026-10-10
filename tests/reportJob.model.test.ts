import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { ReportJob } from "../src/models/ReportJob.js";

describe("ReportJob model", () => {
  it("saves and reads back a pending job", async () => {
    const userId = new mongoose.Types.ObjectId();
    const statusChangedAt = new Date();
    const { _id } = await ReportJob.create({
      userId,
      status: "pending",
      attempts: 0,
      statusChangedAt,
    });
    const job = await ReportJob.findById(_id).lean();
    expect(job?.userId.equals(userId)).toBe(true);
    expect(job?.status).toBe("pending");
    expect(job?.attempts).toBe(0);
    expect(job?.statusChangedAt).toEqual(statusChangedAt);
    expect(job?.lockedUntil).toBeNull();
    expect(job?.lockToken).toBeNull();
    expect(job?.reason).toBeNull();
  });

  it("requires userId", async () => {
    await expect(ReportJob.create({ statusChangedAt: new Date() })).rejects.toThrow(/userId/);
  });

  it("rejects an unknown status", async () => {
    await expect(
      ReportJob.create({
        userId: new mongoose.Types.ObjectId(),
        status: "weird" as "done",
        statusChangedAt: new Date(),
      }),
    ).rejects.toThrow(/status/);
  });

  it("creates the claim and lease indexes", async () => {
    await ReportJob.init();
    const keys = (await ReportJob.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ status: 1, createdAt: 1 }));
    expect(keys).toContain(JSON.stringify({ status: 1, lockedUntil: 1 }));
  });
});
