import { logger } from "../utils/logger.js";
import { LeaseLostError, PermanentJobError } from "./errors.js";
import { EXHAUSTED_REASON, finishJob, renewLease, type ClaimedJob, type JobOutcome } from "./jobQueue.js";
import { processReportJob, type ProcessDeps } from "./processReportJob.js";

export const NO_DATA_REASON = "No inventory data to report.";

export interface RunJobDeps extends Omit<ProcessDeps, "isLeaseLost"> {
  maxAttempts: number;
  leaseMs: number;
}

/** Runs one attempt of a claimed job. Never throws. */
export async function runJob(job: ClaimedJob, deps: RunJobDeps): Promise<void> {
  const jobId = String(job._id);
  try {
    const lockToken = job.lockToken;
    if (!lockToken) throw new Error("Claimed job has no lock token");
    let leaseLost = false;

    // Only a `false` result marks the lease as lost; a thrown error does not.
    const heartbeat = setInterval(() => {
      renewLease(job._id, lockToken, deps.leaseMs).then(
        (ok) => {
          if (!ok) leaseLost = true;
        },
        (err: unknown) => logger.error("heartbeat failed", { jobId, error: String(err) }),
      );
    }, deps.leaseMs / 3);

    let outcome: JobOutcome | null;
    try {
      const { itemCount } = await processReportJob(job, { ...deps, isLeaseLost: () => leaseLost });
      outcome = itemCount > 0 ? { kind: "done" } : { kind: "done", reason: NO_DATA_REASON };
    } catch (err) {
      if (err instanceof LeaseLostError) {
        outcome = null;
      } else if (err instanceof PermanentJobError) {
        outcome = { kind: "failed", reason: err.reason };
      } else {
        logger.error("attempt failed", { jobId, attempt: job.attempts, error: String(err) });
        outcome =
          job.attempts < deps.maxAttempts
            ? { kind: "retry" }
            : { kind: "failed", reason: EXHAUSTED_REASON };
      }
    } finally {
      clearInterval(heartbeat);
    }

    if (!outcome || !(await finishJob(job._id, lockToken, outcome))) {
      logger.warn("lease lost", { jobId, attempt: job.attempts });
      return;
    }
    logger.info("job finished", { jobId, attempt: job.attempts, outcome: outcome.kind });
  } catch (err) {
    logger.error("runJob error", { jobId, error: String(err) });
  }
}
