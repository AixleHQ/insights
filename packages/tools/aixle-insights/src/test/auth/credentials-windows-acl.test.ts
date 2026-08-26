import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Records icacls invocations so we can assert the Windows fallback ACL lock-down without a real Windows host.
const execState = vi.hoisted(() => ({ calls: [] as Array<{ file: string; args: string[] }> }));

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (file: string, args?: readonly string[]) => {
      execState.calls.push({ file, args: (args ?? []).slice() as string[] });
      return Buffer.from("");
    },
  };
});

import { mkdirSync } from "node:fs";
import { clearCredentials, saveCredentials } from "../../auth/credentials.js";

describe("auth/credentials — Windows fallback ACL hardening", () => {
  let home: string;
  const realPlatform = process.platform;

  beforeEach(() => {
    home = join(tmpdir(), `db90-mcp-winacl-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(home, { recursive: true });
    process.env.AIXLE_INSIGHTS_HOME = home;
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true"; // force the file-fallback write path
    execState.calls.length = 0;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  });

  afterEach(async () => {
    Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
    await clearCredentials(home);
    delete process.env.AIXLE_INSIGHTS_HOME;
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
  });

  it("locks down the fallback credentials.json via icacls on Windows", async () => {
    await saveCredentials("file_token", "http://localhost:3000", home);

    const icacls = execState.calls.find((c) => c.file === "icacls");
    expect(icacls, "expected an icacls invocation on win32").toBeDefined();
    expect(icacls?.args[0]).toContain("credentials.json");
    expect(icacls?.args).toContain("/inheritance:r");
    expect(icacls?.args.some((a) => a.startsWith("/grant:r"))).toBe(true);
  });

  it("does NOT call icacls on non-Windows platforms", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    await saveCredentials("file_token", "http://localhost:3000", home);

    expect(execState.calls.some((c) => c.file === "icacls")).toBe(false);
  });
});
