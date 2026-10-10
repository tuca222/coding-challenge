import type { Types } from "mongoose";

export interface ReportJobDto {
  jobId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reason?: string;
}

export function toReportJobDto(job: {
  _id: Types.ObjectId;
  status: string;
  createdAt: Date;
  statusChangedAt: Date;
  reason?: string | null;
}): ReportJobDto {
  const dto: ReportJobDto = {
    jobId: job._id.toHexString(),
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.statusChangedAt.toISOString(),
  };
  if (job.reason != null) dto.reason = job.reason;
  return dto;
}
