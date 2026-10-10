import { setTimeout as sleep } from "node:timers/promises";
import { env } from "../config/env.js";
import { connectDb, ensureIndexes, disconnectDb } from "../db/connect.js";
import { ConsoleEmailSender } from "../services/email/ConsoleEmailSender.js";
import { logger } from "../utils/logger.js";
import { claimNextJob, failExhaustedJobs } from "./jobQueue.js";
import { runJob } from "./runJob.js";
import { wipeReportsDir } from "./tempFiles.js";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  await connectDb(env.MONGO_URI);
  await ensureIndexes();
  await wipeReportsDir(env.REPORTS_DIR);

  let stopping = false;
  const wake = new AbortController();
  const stop = (): void => {
    stopping = true;
    wake.abort(); // cuts the idle sleep short
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  const leaseMs = env.REPORT_LEASE_SECONDS * 1000;
  const deps = {
    emailSender: new ConsoleEmailSender(),
    reportsDir: env.REPORTS_DIR,
    maxAttempts: env.REPORT_MAX_ATTEMPTS,
    leaseMs,
  };
  const idle = (): Promise<void> =>
    sleep(env.WORKER_POLL_INTERVAL_MS, undefined, { signal: wake.signal }).catch(() => undefined);

  logger.info("worker started");
  while (!stopping) {
    try {
      const failed = await failExhaustedJobs(env.REPORT_MAX_ATTEMPTS);
      if (failed > 0) logger.info("exhausted jobs failed", { count: failed });
      const job = await claimNextJob(env.REPORT_MAX_ATTEMPTS, leaseMs);
      if (!job) {
        await idle();
        continue;
      }
      logger.info("job claimed", { jobId: String(job._id), attempt: job.attempts });
      await runJob(job, deps);
    } catch (err) {
      logger.error("worker loop error", { error: message(err) });
      await idle();
    }
  }

  await disconnectDb();
  logger.info("worker stopped");
  process.exit(0);
}

main().catch((err: unknown) => {
  logger.error("worker startup failed", { error: message(err) });
  process.exit(1);
});
