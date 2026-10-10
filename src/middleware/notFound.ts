import type { RequestHandler } from "express";
import { NotFoundError } from "../errors/AppError.js";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
