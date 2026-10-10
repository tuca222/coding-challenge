import { env } from "../src/config/env.js";
import { connectDb, disconnectDb } from "../src/db/connect.js";
import { runSeed } from "../src/seed/runSeed.js";
import { logger } from "../src/utils/logger.js";

async function main(): Promise<void> {
  await connectDb(env.MONGO_URI);
  const summary = await runSeed();
  logger.info("seed done", { ...summary });
  await disconnectDb();
}

main().catch((err: unknown) => {
  logger.error("seed failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
