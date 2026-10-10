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
