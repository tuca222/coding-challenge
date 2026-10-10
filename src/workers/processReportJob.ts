import { join } from "node:path";
import { User } from "../models/User.js";
import type { EmailSender } from "../services/email/EmailSender.js";
import { LeaseLostError, PermanentJobError } from "./errors.js";
import type { ClaimedJob } from "./jobQueue.js";
import { writeInventoryReport } from "./spreadsheet.js";
import { removeFileQuietly } from "./tempFiles.js";

export interface ProcessDeps {
  emailSender: EmailSender;
  reportsDir: string;
  isLeaseLost: () => boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatUtc(d: Date): { compact: string; readable: string } {
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return {
    compact: `${date.replaceAll("-", "")}-${time.replaceAll(":", "")}`,
    readable: `${date} ${time}`,
  };
}

export async function processReportJob(
  job: ClaimedJob,
  deps: ProcessDeps,
): Promise<{ itemCount: number }> {
  const user = await User.findById(job.userId).lean();
  if (!user) throw new PermanentJobError("The user who requested this report no longer exists.");

  const producedAt = new Date();
  const jobId = String(job._id);
  // Unique per attempt, so a retry never reuses a file from a lost lease.
  const filePath = join(deps.reportsDir, `${jobId}-${job.attempts}.xlsx`);

  try {
    const itemCount = await writeInventoryReport(job.userId, filePath);
    if (itemCount === 0) return { itemCount: 0 };
    if (deps.isLeaseLost()) throw new LeaseLostError();

    const { compact, readable } = formatUtc(producedAt);
    await deps.emailSender.send({
      jobId,
      to: user.email,
      subject: "Your inventory report",
      text: `Hello ${user.name},\n\nYour inventory report was produced on ${readable} UTC and contains ${itemCount} items.\n`,
      attachment: { filename: `inventory-report-${compact}Z.xlsx`, path: filePath },
    });
    return { itemCount };
  } finally {
    await removeFileQuietly(filePath);
  }
}
