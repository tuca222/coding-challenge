import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ReportJob } from "../src/models/ReportJob.js";
import { createItems, createUser, tokenFor } from "./helpers.js";

const app = createApp();

interface Body {
  success?: boolean;
  message?: string;
  jobId?: string;
  status?: string;
}
const body = (r: { body: unknown }): Body => r.body as Body;

describe("POST /reports/inventory", () => {
  it("returns 202 with exactly the four fields and stores a pending job", async () => {
    const u = await createUser();
    const res = await request(app)
      .post("/reports/inventory")
      .set("Authorization", `Bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(202);
    expect(Object.keys(body(res)).sort()).toEqual(["jobId", "message", "status", "success"]);
    expect(body(res).success).toBe(true);
    expect(typeof body(res).message).toBe("string");
    expect(body(res).status).toBe("pending");
    const job = await ReportJob.findById(body(res).jobId).lean();
    expect(job?.status).toBe("pending");
    expect(job?.attempts).toBe(0);
    expect(String(job?.userId)).toBe(u.id);
  });

  it("ignores a userId in the body", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await request(app)
      .post("/reports/inventory")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ userId: b.id });
    expect(res.status).toBe(202);
    const job = await ReportJob.findById(body(res).jobId).lean();
    expect(String(job?.userId)).toBe(a.id);
  });

  it("creates a different job per call", async () => {
    const u = await createUser();
    const ids = new Set<string | undefined>();
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/reports/inventory")
        .set("Authorization", `Bearer ${tokenFor(u.id)}`);
      ids.add(body(res).jobId);
    }
    expect(ids.size).toBe(3);
  });

  it("rejects a missing token", async () => {
    const res = await request(app).post("/reports/inventory");
    expect(res.status).toBe(401);
  });

  it("answers 202 for a user with many items in under 200 ms", async () => {
    const u = await createUser();
    await createItems(u.id, 2000);
    const start = performance.now();
    const res = await request(app)
      .post("/reports/inventory")
      .set("Authorization", `Bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(202);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("accepts a user without items", async () => {
    const u = await createUser();
    const res = await request(app)
      .post("/reports/inventory")
      .set("Authorization", `Bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(202);
  });
});

describe("GET /reports/:jobId", () => {
  const get = (id: string, token: string) =>
    request(app).get(`/reports/${id}`).set("Authorization", `Bearer ${token}`);
  const mk = (userId: string, extra: object = {}) =>
    ReportJob.create({ userId, status: "pending", attempts: 2, statusChangedAt: new Date(), ...extra });

  it("returns the owner's job without internal fields", async () => {
    const u = await createUser();
    const job = await mk(u.id);
    const res = await get(job.id, tokenFor(u.id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual([
      "createdAt",
      "jobId",
      "status",
      "updatedAt",
    ]);
    expect((res.body as Body).jobId).toBe(job.id);
  });

  it("includes reason only when present", async () => {
    const u = await createUser();
    const job = await mk(u.id, { status: "done", reason: "No inventory data to report." });
    const res = await get(job.id, tokenFor(u.id));
    expect((res.body as { reason?: string }).reason).toBe("No inventory data to report.");
  });

  it("returns identical 404 bodies for foreign, unknown and malformed ids", async () => {
    const a = await createUser();
    const b = await createUser();
    const job = await mk(b.id);
    const t = tokenFor(a.id);
    const r1 = await get(job.id, t);
    const r2 = await get("665f1c000000000000000000", t);
    const r3 = await get("not-an-id", t);
    expect([r1.status, r2.status, r3.status]).toEqual([404, 404, 404]);
    expect(r2.body).toEqual(r1.body);
    expect(r3.body).toEqual(r1.body);
  });
});
