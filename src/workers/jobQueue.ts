import { randomUUID } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
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

export type JobOutcome =
  | { kind: "done"; reason?: string }
  | { kind: "retry" }
  | { kind: "failed"; reason: string };

/** Extends the lease; false means the lease was lost. */
export async function renewLease(
  jobId: Types.ObjectId,
  lockToken: string,
  leaseMs: number,
): Promise<boolean> {
  const result = await ReportJob.updateOne(
    { _id: jobId, status: "processing", lockToken },
    { $set: { lockedUntil: new Date(Date.now() + leaseMs) } },
  );
  return result.matchedCount === 1;
}

/** Finishes a claimed job; false means the lease was lost and nothing changed. */
export async function finishJob(
  jobId: Types.ObjectId,
  lockToken: string,
  outcome: JobOutcome,
): Promise<boolean> {
  const set: Record<string, unknown> = {
    lockToken: null,
    lockedUntil: null,
    statusChangedAt: new Date(),
  };
  if (outcome.kind === "retry") {
    set.status = "pending";
  } else {
    set.status = outcome.kind;
    if (outcome.reason !== undefined) set.reason = outcome.reason;
  }
  const result = await ReportJob.updateOne(
    { _id: jobId, status: "processing", lockToken },
    { $set: set },
  );
  return result.matchedCount === 1;
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
