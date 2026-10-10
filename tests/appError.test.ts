import { describe, expect, it } from "vitest";
import {
  AppError,
  InvalidCredentialsError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../src/errors/AppError.js";

describe("AppError subclasses", () => {
  const cases: [string, AppError, number, string, string][] = [
    ["InvalidCredentialsError", new InvalidCredentialsError(), 401, "INVALID_CREDENTIALS", "Invalid email or password"],
    ["UnauthorizedError", new UnauthorizedError(), 401, "UNAUTHORIZED", "Authentication required"],
    ["NotFoundError", new NotFoundError(), 404, "NOT_FOUND", "Resource not found"],
    ["ValidationError", new ValidationError(), 400, "VALIDATION_ERROR", "Validation failed"],
  ];

  it.each(cases)("%s has the table status, code and message", (_n, err, status, code, message) => {
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
  });

  it("ValidationError keeps a custom message", () => {
    expect(new ValidationError("email: Invalid email address").message).toBe(
      "email: Invalid email address",
    );
  });

  it("all are instanceof AppError and Error", () => {
    for (const [, err] of cases) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
