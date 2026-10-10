import express from "express";
import type { Express } from "express";
import { router } from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
