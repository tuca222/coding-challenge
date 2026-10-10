import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportJob } from "../src/models/ReportJob.js";
import type { EmailMessage, EmailSender } from "../src/services/email/EmailSender.js";
import { LeaseLostError, PermanentJobError } from "../src/workers/errors.js";
import type { ClaimedJob } from "../src/workers/jobQueue.js";
import { processReportJob } from "../src/workers/processReportJob.js";
import { createItems, createUser } from "./helpers.js";

let dir: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

function fakeSender(fail = false): { sender: EmailSender; sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    sender: {
      send: (m) => {
        if (fail) return Promise.reject(new Error("smtp down"));
        sent.push(m);
        return Promise.resolve();
      },
    },
  };
}

async function makeJob(userId: string | Types.ObjectId): Promise<ClaimedJob> {
  return ReportJob.create({
    userId,
    status: "processing",
    attempts: 1,
    statusChangedAt: new Date(),
  });
}

async function deps(sender: EmailSender, isLeaseLost = (): boolean => false) {
  dir = await mkdtemp(join(tmpdir(), "t28-"));
  return { emailSender: sender, reportsDir: dir, isLeaseLost };
}

describe("processReportJob", () => {
  it("sends one email and deletes the file", async () => {
    const user = await createUser({ name: "Ann" });
    await createItems(user.id, 3);
    const job = await makeJob(user.id);
    const { sender, sent } = fakeSender();
    const d = await deps(sender);

    const result = await processReportJob(job, d);

    expect(result).toEqual({ itemCount: 3 });
    expect(sent).toHaveLength(1);
    expect(sent[0].jobId).toBe(String(job._id));
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toBe("Your inventory report");
    expect(sent[0].text).toMatch(/Hello Ann,/);
    expect(sent[0].text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC and contains 3 items/);
    expect(sent[0].attachment.filename).toMatch(/^inventory-report-\d{8}-\d{6}Z\.xlsx$/);
    expect(await readdir(d.reportsDir)).toEqual([]);
  });

  it("throws when the email fails and still deletes the file", async () => {
    const user = await createUser();
    await createItems(user.id, 2);
    const job = await makeJob(user.id);
    const d = await deps(fakeSender(true).sender);

    await expect(processReportJob(job, d)).rejects.toThrow("smtp down");
    expect(await readdir(d.reportsDir)).toEqual([]);
  });

  it("sends no email for an empty inventory and logs no warning", async () => {
    const user = await createUser();
    const job = await makeJob(user.id);
    const { sender, sent } = fakeSender();
    const d = await deps(sender);
    const warn = vi.spyOn(process.stdout, "write");

    const result = await processReportJob(job, d);

    expect(result).toEqual({ itemCount: 0 });
    expect(sent).toHaveLength(0);
    expect(await readdir(d.reportsDir)).toEqual([]);
    expect(warn.mock.calls.some(([c]) => String(c).includes('"level":"warn"'))).toBe(false);
  });

  it("throws PermanentJobError for a missing user", async () => {
    const job = await makeJob(new Types.ObjectId());
    const d = await deps(fakeSender().sender);
    await expect(processReportJob(job, d)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("throws LeaseLostError and sends no email when the lease is lost", async () => {
    const user = await createUser();
    await createItems(user.id, 2);
    const job = await makeJob(user.id);
    const { sender, sent } = fakeSender();
    const d = await deps(sender, () => true);

    await expect(processReportJob(job, d)).rejects.toBeInstanceOf(LeaseLostError);
    expect(sent).toHaveLength(0);
    expect(await readdir(d.reportsDir)).toEqual([]);
  });
});
