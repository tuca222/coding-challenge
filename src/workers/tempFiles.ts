import { mkdir, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

export async function wipeReportsDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const entry of await readdir(dir)) {
    await rm(join(dir, entry), { recursive: true, force: true });
  }
}

export async function removeFileQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    logger.warn("could not remove temp file", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
