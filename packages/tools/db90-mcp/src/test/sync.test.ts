import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let origHome: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "db90-mcp-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tmp;
  vi.resetModules();
});

afterEach(() => {
  if (origHome !== undefined) process.env.HOME = origHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe("syncAll", () => {
  it("returns 'not authenticated' when no credentials are stored", async () => {
    // Force the keychain fallback path: stub keytar as unavailable.
    vi.doMock("keytar", () => {
      throw new Error("keytar unavailable");
    });
    const { syncAll } = await import("../sync.js");
    const result = await syncAll();
    expect(result).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: ["not authenticated"],
    });
  });
});
