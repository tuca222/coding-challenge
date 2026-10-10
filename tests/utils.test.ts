import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/utils/logger.js";
import { centsToDollars } from "../src/utils/money.js";

describe("centsToDollars", () => {
  it("converts cents to dollars", () => {
    expect(centsToDollars(1999)).toBe(19.99);
    expect(centsToDollars(0)).toBe(0);
    expect(centsToDollars(100)).toBe(1);
  });
});

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("info writes one JSON line to stdout", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("job claimed", { jobId: "abc", attempt: 1 });
    expect(out).toHaveBeenCalledTimes(1);
    const line = String(out.mock.calls[0]?.[0]);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({ level: "info", msg: "job claimed", jobId: "abc", attempt: 1 });
  });

  it("error writes to stderr", () => {
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.error("boom");
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).not.toHaveBeenCalled();
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toEqual({ level: "error", msg: "boom" });
  });
});
