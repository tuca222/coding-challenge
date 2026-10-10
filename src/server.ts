import { env } from "./config/env.js";
import { connectDb, ensureIndexes, disconnectDb } from "./db/connect.js";
import { getDummyHash } from "./services/authService.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  await connectDb(env.MONGO_URI);
  await ensureIndexes();
  await getDummyHash();

  const server = createApp().listen(env.PORT, () => {
    logger.info("api listening", { port: env.PORT });
  });

  const shutdown = (): void => {
    server.close(() => {
      disconnectDb()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          logger.error("shutdown failed", { error: err instanceof Error ? err.message : String(err) });
          process.exit(1);
        });
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  logger.error("startup failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
