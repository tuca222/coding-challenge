import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleEmailSender } from "../src/services/email/ConsoleEmailSender.js";
import type { EmailMessage } from "../src/services/email/EmailSender.js";

function message(path: string): EmailMessage {
  return {
    jobId: "job1",
    to: "a@example.com",
    subject: "Your inventory report",
    text: "hi",
    attachment: { filename: "r.xlsx", path },
  };
}

describe("ConsoleEmailSender", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs one 'email sent' line for an existing attachment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "email-"));
    const path = join(dir, "r.xlsx");
    await writeFile(path, "12345");
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await new ConsoleEmailSender().send(message(path));
    await rm(dir, { recursive: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({
      msg: "email sent",
      jobId: "job1",
      to: "a@example.com",
      subject: "Your inventory report",
      attachment: "r.xlsx",
      size: 5,
    });
  });

  it("rejects and logs nothing when the attachment is missing", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(new ConsoleEmailSender().send(message("/nonexistent/r.xlsx"))).rejects.toThrow();
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
});
