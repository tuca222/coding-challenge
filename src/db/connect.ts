import mongoose from "mongoose";
import { User } from "../models/User.js";
import { InventoryItem } from "../models/InventoryItem.js";
import { ReportJob } from "../models/ReportJob.js";
import { logger } from "../utils/logger.js";

const ATTEMPTS = 5;
const DELAY_MS = 2000;

export async function connectDb(uri: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri);
      return;
    } catch (err) {
      logger.error("mongo connection failed", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt >= ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
}

export async function ensureIndexes(): Promise<void> {
  await Promise.all([User.init(), InventoryItem.init(), ReportJob.init()]);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
