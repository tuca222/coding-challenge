import { Schema, model, type InferSchemaType } from "mongoose";

export const REPORT_JOB_STATUSES = ["pending", "processing", "done", "failed"] as const;

const reportJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: REPORT_JOB_STATUSES, required: true, default: "pending" },
    attempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
    lockToken: { type: String, default: null },
    reason: { type: String, default: null },
    // Set explicitly on every status write; updatedAt also changes on heartbeats.
    statusChangedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

reportJobSchema.index({ status: 1, createdAt: 1 });
reportJobSchema.index({ status: 1, lockedUntil: 1 });

export type ReportJobAttrs = InferSchemaType<typeof reportJobSchema>;

export const ReportJob = model("ReportJob", reportJobSchema, "reportJobs");
