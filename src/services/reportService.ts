import { ReportJob } from "../models/ReportJob.js";
import { NotFoundError } from "../errors/AppError.js";
import { toReportJobDto } from "../dto/reportJobDto.js";
import type { ReportJobDto } from "../dto/reportJobDto.js";

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

// Owner filter lives in the query: another user's job looks like a missing one.
export async function getJob(userId: string, jobId: string): Promise<ReportJobDto> {
  if (!/^[a-f0-9]{24}$/i.test(jobId)) throw new NotFoundError();
  const job = await ReportJob.findOne({ _id: jobId, userId }).lean();
  if (!job) throw new NotFoundError();
  return toReportJobDto(job);
}
