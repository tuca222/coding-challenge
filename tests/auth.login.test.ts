import bcrypt from "bcrypt";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { verifyToken } from "../src/services/authService.js";
import { createUser, loginAs } from "./helpers.js";

const app = createApp();

interface Body {
  token?: string;
  error?: { code: string };
}
const body = (r: { body: unknown }): Body => r.body as Body;

afterEach(() => vi.restoreAllMocks());

describe("POST /auth/login", () => {
  it("returns only a token for valid credentials", async () => {
    const u = await createUser();
    const res = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: u.password });
    expect(res.status).toBe(200);
    expect(Object.keys(body(res))).toEqual(["token"]);
    expect(verifyToken(body(res).token ?? "")).toBe(u.id);
  });

  it("loginAs returns a usable token", async () => {
    const u = await createUser();
    expect(verifyToken(await loginAs(app, u.email, u.password))).toBe(u.id);
  });

  it("accepts email with other case and spaces", async () => {
    const u = await createUser({ email: "mixed@example.com" });
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "  Mixed@Example.COM ", password: u.password });
    expect(res.status).toBe(200);
  });

  it("returns the same 401 for wrong password and unknown email", async () => {
    const u = await createUser();
    const wrong = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: "nope" });
    const unknown = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(body(wrong).error?.code).toBe("INVALID_CREDENTIALS");
    expect(body(wrong).token).toBeUndefined();
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("runs bcrypt.compare for an unknown email", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "nope" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing email", { password: "x" }],
    ["missing password", { email: "a@example.com" }],
    ["empty password", { email: "a@example.com", password: "" }],
    ["wrong type", { email: "a@example.com", password: 123 }],
    ["invalid email", { email: "not-an-email", password: "x" }],
  ])("returns 400 for %s", async (_n, payload) => {
    const res = await request(app).post("/auth/login").send(payload);
    expect(res.status).toBe(400);
    expect(body(res).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when there is no body", async () => {
    const res = await request(app).post("/auth/login");
    expect(res.status).toBe(400);
    expect(body(res).error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 INVALID_JSON for malformed JSON", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(body(res).error?.code).toBe("INVALID_JSON");
  });

  it("returns 404 for GET /auth/login", async () => {
    const res = await request(app).get("/auth/login");
    expect(res.status).toBe(404);
  });

  it("never returns the password or the hash", async () => {
    const u = await createUser({ password: "s3cret-pw-xyz" });
    const responses = [
      await request(app).post("/auth/login").send({ email: u.email, password: u.password }),
      await request(app).post("/auth/login").send({ email: u.email, password: "s3cret-pw-wrong" }),
      await request(app).post("/auth/login").send({ email: u.email }),
    ];
    for (const r of responses) {
      expect(r.text).not.toContain("s3cret-pw");
      expect(r.text).not.toContain("$2b$");
    }
  });
});
