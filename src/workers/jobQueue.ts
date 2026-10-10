import { randomUUID } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { ReportJob, type ReportJobAttrs } from "../models/ReportJob.js";

export const EXHAUSTED_REASON = "The report could not be produced after several attempts.";

export type ClaimedJob = HydratedDocument<ReportJobAttrs>;

/** Atomically claims the oldest eligible job (pending, or processing with an expired lease). */
export async function claimNextJob(maxAttempts: number, leaseMs: number): Promise<ClaimedJob | null> {
  const now = Date.now();
  return ReportJob.findOneAndUpdate(
    {
      attempts: { $lt: maxAttempts },
      $or: [{ status: "pending" }, { status: "processing", lockedUntil: { $lt: new Date(now) } }],
    },
    {
      $set: {
        status: "processing",
        lockedUntil: new Date(now + leaseMs),
        lockToken: randomUUID(),
        reason: null,
        statusChangedAt: new Date(now),
      },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
}

/** Fails jobs that have no attempts left and are not running; returns how many. */
export async function failExhaustedJobs(maxAttempts: number): Promise<number> {
  const now = new Date();
  const result = await ReportJob.updateMany(
    {
      attempts: { $gte: maxAttempts },
      $or: [{ status: "pending" }, { status: "processing", lockedUntil: { $lt: now } }],
    },
    {
      $set: {
        status: "failed",
        reason: EXHAUSTED_REASON,
        lockToken: null,
        lockedUntil: null,
        statusChangedAt: now,
      },
    },
  );
  return result.modifiedCount;
}
