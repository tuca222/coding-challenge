import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/errors/AppError.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { jsonBody } from "../src/middleware/jsonBody.js";

function testApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.post("/echo", jsonBody, (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/app-error", () => {
    throw new AppError(418, "TEAPOT", "I am a teapot");
  });
  app.use(errorHandler);
  return app;
}

function expectShape(body: unknown): void {
  expect(Object.keys(body as object)).toEqual(["error"]);
  const err = (body as { error: object }).error;
  expect(Object.keys(err).sort()).toEqual(["code", "message"]);
}

describe("error handling", () => {
  it("invalid JSON -> 400 INVALID_JSON", async () => {
    const res = await request(testApp()).post("/echo").set("content-type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("INVALID_JSON");
    expectShape(res.body);
  });

  it("body over 10 kB -> 400 PAYLOAD_TOO_LARGE", async () => {
    const res = await request(testApp())
      .post("/echo")
      .send({ a: "x".repeat(11 * 1024) });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("PAYLOAD_TOO_LARGE");
    expectShape(res.body);
  });

  it("AppError keeps status, code and message", async () => {
    const res = await request(testApp()).get("/app-error");
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ error: { code: "TEAPOT", message: "I am a teapot" } });
  });

  it("unknown path -> 404 NOT_FOUND without x-powered-by", async () => {
    const res = await request(createApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
