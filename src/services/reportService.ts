import { ReportJob } from "../models/ReportJob.js";

// One insert, no inventory read: response time does not depend on inventory size.
export async function createJob(userId: string): Promise<{ jobId: string; status: string }> {
  const job = await ReportJob.create({
    userId,
    status: "pending",
    attempts: 0,
    statusChangedAt: new Date(),
  });
  return { jobId: job._id.toHexString(), status: job.status };
}
