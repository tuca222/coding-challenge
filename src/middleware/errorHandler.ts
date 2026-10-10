import type { ErrorRequestHandler, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { logger } from "../utils/logger.js";

function bodyParserType(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { type, status } = err as { type?: unknown; status?: unknown };
  if (typeof type !== "string" || typeof status !== "number") return undefined;
  return status >= 400 && status < 500 ? type : undefined;
}

function send(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

// Never logs the request body (it may hold a password).
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    send(res, err.status, err.code, err.message);
    return;
  }
  const type = bodyParserType(err);
  if (type === "entity.parse.failed") {
    send(res, 400, "INVALID_JSON", "Request body is not valid JSON");
  } else if (type === "entity.too.large") {
    send(res, 400, "PAYLOAD_TOO_LARGE", "Request body is too large");
  } else if (type !== undefined) {
    send(res, 400, "BAD_REQUEST", "Bad request");
  } else {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error("unhandled error", { message: e.message, stack: e.stack });
    send(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
};
