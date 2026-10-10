import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createUser, tokenFor } from "./helpers.js";

const app = createApp();

describe("GET /users/me", () => {
  it("returns exactly id, name, email, createdAt of the caller", async () => {
    const u = await createUser({ name: "Alice" });
    const res = await request(app).get("/users/me").set("Authorization", `Bearer ${tokenFor(u.id)}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(["createdAt", "email", "id", "name"]);
    expect(res.body).toMatchObject({ id: u.id, name: "Alice", email: u.email });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("ignores another user's id in query, body and header", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await request(app)
      .get(`/users/me?id=${b.id}&userId=${b.id}`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .set("x-user-id", b.id)
      .send({ id: b.id, userId: b.id });
    expect(res.status).toBe(200);
    expect((res.body as { id: string }).id).toBe(a.id);
  });

  it("rejects a missing token", async () => {
    const res = await request(app).get("/users/me");
    expect(res.status).toBe(401);
  });

  it("valid token + invalid JSON body -> 400 INVALID_JSON", async () => {
    const u = await createUser();
    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${tokenFor(u.id)}`)
      .set("content-type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("INVALID_JSON");
  });

  it("invalid JSON without a token -> 401 (authenticate runs first)", async () => {
    const res = await request(app).get("/users/me").set("content-type", "application/json").send("{bad");
    expect(res.status).toBe(401);
  });
});
