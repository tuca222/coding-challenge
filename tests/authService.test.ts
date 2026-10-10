import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { UnauthorizedError } from "../src/errors/AppError.js";
import { getDummyHash, signToken, verifyToken } from "../src/services/authService.js";

const id = "0123456789abcdef01234567";

describe("authService tokens", () => {
  it("signs only sub, iat, exp with the configured lifetime", () => {
    const p = jwt.decode(signToken(id)) as Record<string, number | string>;
    expect(Object.keys(p).sort()).toEqual(["exp", "iat", "sub"]);
    expect((p.exp as number) - (p.iat as number)).toBe(env.JWT_EXPIRES_IN_SECONDS);
  });

  it("verifies a valid token to its sub", () => {
    expect(verifyToken(signToken(id))).toBe(id);
  });

  it("rejects an expired token", () => {
    const t = jwt.sign({}, env.JWT_SECRET, { subject: id, expiresIn: -10 });
    expect(() => verifyToken(t)).toThrow(UnauthorizedError);
  });

  it("rejects a wrong signature", () => {
    const t = jwt.sign({}, "other-secret", { subject: id });
    expect(() => verifyToken(t)).toThrow(UnauthorizedError);
  });

  it("rejects alg none", () => {
    const b = (o: object): string => Buffer.from(JSON.stringify(o)).toString("base64url");
    const t = `${b({ alg: "none", typ: "JWT" })}.${b({ sub: id })}.`;
    expect(() => verifyToken(t)).toThrow(UnauthorizedError);
  });

  it("rejects a missing or malformed sub", () => {
    expect(() => verifyToken(jwt.sign({}, env.JWT_SECRET))).toThrow(UnauthorizedError);
    expect(() => verifyToken(jwt.sign({}, env.JWT_SECRET, { subject: "abc" }))).toThrow(
      UnauthorizedError,
    );
  });
});

describe("getDummyHash", () => {
  it("is memoized and a bcrypt hash", async () => {
    expect(getDummyHash()).toBe(getDummyHash());
    expect(await getDummyHash()).toMatch(/^\$2[aby]\$/);
  });
});
