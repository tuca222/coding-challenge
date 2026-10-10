import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { ReportJob } from "../src/models/ReportJob.js";
import { EXHAUSTED_REASON, claimNextJob, failExhaustedJobs } from "../src/workers/jobQueue.js";

const MAX = 3;
const LEASE = 60_000;

type Seed = {
  status?: "pending" | "processing" | "done" | "failed";
  attempts?: number;
  lockedUntil?: Date | null;
  createdAt?: Date;
};

async function seed(over: Seed = {}): Promise<mongoose.Types.ObjectId> {
  const doc = await ReportJob.create({
    userId: new mongoose.Types.ObjectId(),
    status: "pending",
    attempts: 0,
    statusChangedAt: new Date(0),
    ...over,
  });
  return doc._id;
}

const past = (): Date => new Date(Date.now() - 10_000);
const future = (): Date => new Date(Date.now() + 60_000);

beforeEach(async () => {
  await ReportJob.deleteMany({});
});

describe("claimNextJob", () => {
  it("claims the oldest pending job", async () => {
    const old = await seed({ createdAt: new Date(1000) });
    await seed({ createdAt: new Date(2000) });
    const before = Date.now();
    const job = await claimNextJob(MAX, LEASE);
    expect(job?._id.equals(old)).toBe(true);
    expect(job?.status).toBe("processing");
    expect(job?.attempts).toBe(1);
    expect(job?.lockToken).toEqual(expect.any(String));
    expect(job?.lockedUntil?.getTime()).toBeGreaterThanOrEqual(before + LEASE);
    expect(job?.reason).toBeNull();
    expect(job?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns null when nothing is eligible", async () => {
    expect(await claimNextJob(MAX, LEASE)).toBeNull();
  });

  it("claims each job exactly once under concurrency", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => seed()));
    const results = await Promise.all(Array.from({ length: 20 }, () => claimNextJob(MAX, LEASE)));
    const claimed = results.filter((j) => j !== null).map((j) => String(j._id));
    expect(claimed).toHaveLength(5);
    expect(new Set(claimed)).toEqual(new Set(ids.map(String)));
  });

  it("reclaims a processing job with an expired lease", async () => {
    const id = await seed({ status: "processing", attempts: 1, lockedUntil: past() });
    const job = await claimNextJob(MAX, LEASE);
    expect(job?._id.equals(id)).toBe(true);
    expect(job?.attempts).toBe(2);
  });

  it("does not claim a processing job with a valid lease", async () => {
    await seed({ status: "processing", attempts: 1, lockedUntil: future() });
    expect(await claimNextJob(MAX, LEASE)).toBeNull();
  });

  it("does not claim a job with attempts >= max", async () => {
    await seed({ attempts: MAX });
    expect(await claimNextJob(MAX, LEASE)).toBeNull();
  });
});

describe("failExhaustedJobs", () => {
  it("fails an expired, exhausted processing job", async () => {
    const id = await seed({ status: "processing", attempts: MAX, lockedUntil: past() });
    await failExhaustedJobs(MAX);
    const job = await ReportJob.findById(id).lean();
    expect(job?.status).toBe("failed");
    expect(job?.reason).toBe(EXHAUSTED_REASON);
    expect(job?.lockToken).toBeNull();
    expect(job?.lockedUntil).toBeNull();
    expect(job?.statusChangedAt.getTime()).toBeGreaterThan(0);
  });

  it("fails a pending job with attempts >= max", async () => {
    const id = await seed({ attempts: 2 });
    await failExhaustedJobs(2);
    const job = await ReportJob.findById(id).lean();
    expect(job?.status).toBe("failed");
    expect(job?.reason).toBe(EXHAUSTED_REASON);
  });

  it("leaves other jobs untouched", async () => {
    const ids = [
      await seed({ attempts: 1, createdAt: new Date(1) }),
      await seed({ status: "processing", attempts: MAX, lockedUntil: future(), createdAt: new Date(2) }),
      await seed({ status: "done", attempts: MAX, createdAt: new Date(3) }),
      await seed({ status: "failed", attempts: MAX, createdAt: new Date(4) }),
    ];
    expect(await failExhaustedJobs(MAX)).toBe(0);
    const jobs = await ReportJob.find({ _id: { $in: ids } }).sort({ createdAt: 1 }).lean();
    expect(jobs.map((j) => j.status)).toEqual(["pending", "processing", "done", "failed"]);
    expect(jobs.every((j) => j.reason === null)).toBe(true);
  });
});
