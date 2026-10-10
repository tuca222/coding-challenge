import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { UnauthorizedError } from "../src/errors/AppError.js";
import { authenticate, getAuth } from "../src/middleware/authenticate.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { createUser, tokenFor } from "./helpers.js";

const app = express();
app.get("/protected", authenticate, (req, res) => {
  res.json({ userId: getAuth(req).userId });
});
app.get("/unprotected", (req, res) => {
  res.json({ userId: getAuth(req).userId });
});
app.use(errorHandler);

const body401 = { error: { code: "UNAUTHORIZED", message: "Authentication required" } };

describe("authenticate", () => {
  it("accepts a valid token and sets req.auth", async () => {
    const u = await createUser();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: u.id });
  });

  it("accepts a lowercase bearer scheme", async () => {
    const u = await createUser();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(200);
  });

  it.each([[undefined], ["Basic abc"], ["Bearer"], ["Bearer "]])(
    "rejects header %s",
    async (h) => {
      const req = request(app).get("/protected");
      if (h !== undefined) req.set("Authorization", h);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body).toEqual(body401);
    },
  );

  it("returns the same 401 for invalid token, expired token and deleted user", async () => {
    const u = await createUser();
    const expired = jwt.sign({}, env.JWT_SECRET, { subject: u.id, expiresIn: -10 });
    const ghost = tokenFor("0123456789abcdef01234567");
    for (const t of ["garbage", expired, ghost]) {
      const res = await request(app).get("/protected").set("Authorization", `Bearer ${t}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(body401);
    }
  });

  it("getAuth without req.auth throws UnauthorizedError", async () => {
    expect(() => getAuth({} as express.Request)).toThrow(UnauthorizedError);
    const res = await request(app).get("/unprotected");
    expect(res.status).toBe(401);
  });
});
