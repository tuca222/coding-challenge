import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createUser, tokenFor } from "./helpers.js";

const app = createApp();

const routes = [
  { name: "GET /users/me", method: "get", path: "/users/me" },
  { name: "GET /inventory", method: "get", path: "/inventory" },
  { name: "POST /reports/inventory", method: "post", path: "/reports/inventory" },
  { name: "GET /reports/:jobId", method: "get", path: "/reports/0123456789abcdef01234567" },
] as const;

const body401 = { error: { code: "UNAUTHORIZED", message: "Authentication required" } };

describe.each(routes)("auth on $name", ({ method, path }) => {
  it("no header -> 401", async () => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(body401);
  });

  it("non-bearer header -> 401", async () => {
    const res = await request(app)[method](path).set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(body401);
  });

  it("bad signature, alg none, expired token and deleted user -> same 401", async () => {
    const u = await createUser();
    const badSig = jwt.sign({}, "another-secret-another-secret-123456", { subject: u.id });
    const none = jwt.sign({}, "", { subject: u.id, algorithm: "none" });
    const expired = jwt.sign({}, env.JWT_SECRET, { subject: u.id, expiresIn: -10 });
    const ghost = tokenFor("0123456789abcdef01234567");
    for (const t of [badSig, none, expired, ghost]) {
      const res = await request(app)[method](path).set("Authorization", `Bearer ${t}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(body401);
    }
  });

  it("no token + invalid JSON body -> 401, not 400", async () => {
    const res = await request(app)[method](path)
      .set("content-type", "application/json")
      .send("{bad");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(body401);
  });
});
