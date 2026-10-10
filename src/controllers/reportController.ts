import type { Request, Response } from "express";
import { getAuth } from "../middleware/authenticate.js";
import { createJob } from "../services/reportService.js";

export async function createInventoryReport(req: Request, res: Response): Promise<void> {
  const { userId } = getAuth(req);
  const { jobId, status } = await createJob(userId);
  res.status(202).json({
    success: true,
    message: "Report generation started",
    jobId,
    status,
  });
}
