import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportJob } from "../src/models/ReportJob.js";
import type { EmailSender } from "../src/services/email/EmailSender.js";
import * as spreadsheet from "../src/workers/spreadsheet.js";
import * as queue from "../src/workers/jobQueue.js";
import { runJob, type RunJobDeps } from "../src/workers/runJob.js";
import { createItems, createUser } from "./helpers.js";

const LEASE = 3000;
let dir: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function mk(sender: EmailSender, maxAttempts = 3): Promise<RunJobDeps> {
  dir = await mkdtemp(join(tmpdir(), "t29-"));
  return { emailSender: sender, reportsDir: dir, maxAttempts, leaseMs: LEASE };
}
const okSender: EmailSender = { send: () => Promise.resolve() };
const badSender: EmailSender = { send: () => Promise.reject(new Error("smtp down")) };

async function enqueue(userId: string): Promise<void> {
  await ReportJob.create({ userId, status: "pending", statusChangedAt: new Date() });
}
async function claim(max = 3): Promise<queue.ClaimedJob> {
  const job = await queue.claimNextJob(max, LEASE);
  if (!job) throw new Error("no job");
  return job;
}
function stderrText(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((c) => String(c[0])).join("");
}
/** A sender that blocks until `release()` is called. */
function blockingSender(): { sender: EmailSender; release: () => void; started: () => boolean } {
  let release: () => void = () => undefined;
  let started = false;
  return {
    sender: {
      send: () =>
        new Promise<void>((r) => {
          started = true;
          release = r;
        }),
    },
    release: () => release(),
    started: () => started,
  };
}

describe("runJob", () => {
  it("success with items -> done, no reason", async () => {
    const u = await createUser();
    await createItems(u.id, 2);
    await enqueue(u.id);
    const job = await claim();
    await runJob(job, await mk(okSender));
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("done");
    expect(after?.reason ?? null).toBeNull();
  });

  it("empty inventory -> done with no-data reason", async () => {
    const u = await createUser();
    await enqueue(u.id);
    const job = await claim();
    await runJob(job, await mk(okSender));
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("done");
    expect(after?.reason).toBe("No inventory data to report.");
  });

  it("missing user -> failed after one attempt", async () => {
    await enqueue("64b000000000000000000001");
    const job = await claim();
    await runJob(job, await mk(okSender));
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("failed");
    expect(after?.attempts).toBe(1);
    expect(after?.reason).toBe("The user who requested this report no longer exists.");
  });

  it("email fails once -> pending, then done", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    let calls = 0;
    const flaky: EmailSender = {
      send: () => (calls++ === 0 ? Promise.reject(new Error("boom")) : Promise.resolve()),
    };
    const d = await mk(flaky);
    const job = await claim();
    await runJob(job, d);
    expect((await ReportJob.findById(job._id).lean())?.status).toBe("pending");
    await runJob(await claim(), d);
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("done");
    expect(after?.attempts).toBe(2);
  });

  it("email always fails -> failed with exhausted reason", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    const d = await mk(badSender, 2);
    const job = await claim(2);
    await runJob(job, d);
    expect((await ReportJob.findById(job._id).lean())?.status).toBe("pending");
    await runJob(await claim(2), d);
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("failed");
    expect(after?.attempts).toBe(2);
    expect(after?.reason).toBe("The report could not be produced after several attempts.");
  });

  it("lease lost -> no write", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    const job = await claim();
    // Another worker took the job over.
    await ReportJob.updateOne({ _id: job._id }, { $set: { lockToken: "other" } });
    await runJob(job, await mk(okSender));
    const after = await ReportJob.findById(job._id).lean();
    expect(after?.status).toBe("processing");
    expect(after?.lockToken).toBe("other");
  });

  it("lease lost seen by the heartbeat -> no email", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    const job = await claim();
    vi.spyOn(queue, "renewLease").mockResolvedValue(false);
    const send = vi.fn(() => Promise.resolve());
    const d = await mk({ send });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    // The heartbeat fires while the report is being written.
    vi.spyOn(spreadsheet, "writeInventoryReport").mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(LEASE / 3);
      return 1;
    });
    await runJob(job, d);
    expect(send).not.toHaveBeenCalled();
    expect((await ReportJob.findById(job._id).lean())?.status).toBe("processing");
  });

  it("heartbeat renews the lease while the job runs", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    const job = await claim();
    const spy = vi.spyOn(queue, "renewLease");
    const b = blockingSender();
    const d = await mk(b.sender);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const p = runJob(job, d);
    await vi.waitFor(() => expect(b.started()).toBe(true));
    await vi.advanceTimersByTimeAsync(LEASE);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(spy.mock.calls[0][0]).toEqual(job._id);
    b.release();
    vi.useRealTimers();
    await p;
    expect((await ReportJob.findById(job._id).lean())?.status).toBe("done");
  });

  it("renewLease throws once -> logged, lease not lost, job done", async () => {
    const u = await createUser();
    await createItems(u.id, 1);
    await enqueue(u.id);
    const job = await claim();
    vi.spyOn(queue, "renewLease").mockRejectedValueOnce(new Error("mongo down"));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const b = blockingSender();
    const d = await mk(b.sender);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const p = runJob(job, d);
    await vi.waitFor(() => expect(b.started()).toBe(true));
    await vi.advanceTimersByTimeAsync(LEASE / 3);
    b.release();
    vi.useRealTimers();
    await p;
    const text = stderrText(err);
    expect(text).toContain("heartbeat failed");
    expect(text).toContain(String(job._id));
    expect((await ReportJob.findById(job._id).lean())?.status).toBe("done");
  });

  it("never throws and logs the jobId", async () => {
    const u = await createUser();
    await enqueue(u.id);
    const job = await claim();
    vi.spyOn(queue, "finishJob").mockRejectedValue(new Error("db gone"));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(runJob(job, await mk(okSender))).resolves.toBeUndefined();
    expect(stderrText(err)).toContain(String(job._id));
  });
});
