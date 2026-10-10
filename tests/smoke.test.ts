import { inject, expect, it } from "vitest";

it("provides the memory server URI", () => {
  expect(inject("mongoUri")).toMatch(/^mongodb:\/\//);
});
