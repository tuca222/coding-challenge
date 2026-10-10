import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermanentJobError } from "../src/workers/errors.js";
import { removeFileQuietly, wipeReportsDir } from "../src/workers/tempFiles.js";

let base: string | undefined;
async function tmp(): Promise<string> {
  base = await mkdtemp(join(tmpdir(), "t24-"));
  return base;
}
afterEach(async () => {
  vi.restoreAllMocks();
  if (base) await rm(base, { recursive: true, force: true });
  base = undefined;
});

describe("wipeReportsDir", () => {
  it("creates a missing dir", async () => {
    const dir = join(await tmp(), "reports");
    await wipeReportsDir(dir);
    expect(await readdir(dir)).toEqual([]);
  });

  it("empties a dir with files", async () => {
    const dir = await tmp();
    await writeFile(join(dir, "a.xlsx"), "x");
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "sub", "b"), "x");
    await wipeReportsDir(dir);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("removeFileQuietly", () => {
  it("removes an existing file", async () => {
    const file = join(await tmp(), "a.xlsx");
    await writeFile(file, "x");
    await removeFileQuietly(file);
    await expect(access(file)).rejects.toThrow();
  });

  it("does not throw on a missing file and logs a warning", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(removeFileQuietly(join(await tmp(), "nope"))).resolves.toBeUndefined();
    expect(String(write.mock.calls[0]?.[0])).toContain('"level":"warn"');
  });
});

describe("PermanentJobError", () => {
  it("keeps its reason", () => {
    expect(new PermanentJobError("bad").reason).toBe("bad");
  });
});
