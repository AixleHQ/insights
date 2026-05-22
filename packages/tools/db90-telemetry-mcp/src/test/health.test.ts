import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergePersistedOperators } from "../health.js";

describe("mergePersistedOperators", () => {
  it("picks the newest last_sync_at", () => {
    const a = {
      last_sync_at: "2026-05-15T10:00:00.000Z",
      last_result: null,
      recent_errors: [] as string[],
    };
    const b = {
      last_sync_at: "2026-05-16T10:00:00.000Z",
      last_result: null,
      recent_errors: [] as string[],
    };
    expect(mergePersistedOperators([a, b])?.last_sync_at).toBe(b.last_sync_at);
  });
});

describe("buildHealthSnapshot", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "db90-mcp-health-"));
    process.env.DB90_MCP_HOME = home;
    process.env.DB90_MCP_DISABLE_KEYTAR = "true";
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    delete process.env.DB90_MCP_HOME;
    delete process.env.DB90_MCP_DISABLE_KEYTAR;
    vi.restoreAllMocks();
  });

  it("includes log_path and marks unconfigured without credentials", async () => {
    vi.resetModules();
    const { buildHealthSnapshot } = await import("../health.js");
    const s = await buildHealthSnapshot();
    expect(s.configured).toBe(false);
    expect(s.authenticated).toBe(false);
    expect(s.log_path).toBe(join(home, "mcp.log"));
  });

  it("surfaces persisted operator errors from a credential state file (fresh process)", async () => {
    const creds = { token: "db90_test", host: "http://localhost:3000" };
    writeFileSync(join(home, "credentials.json"), JSON.stringify(creds), "utf-8");

    vi.resetModules();
    const { stateKey, writeState, readState, withMcpOperator } = await import("../state.js");
    const base = readState(home, creds.host, creds.token);
    writeState(
      withMcpOperator(base, {
        last_sync_at: "2026-05-20T00:00:00.000Z",
        last_result: { sent: 0, failed: 1, skipped: 0 },
        recent_errors: ["persisted failure"],
      }),
      home,
      creds.host,
      creds.token
    );

    const fname = `${stateKey(creds.host, creds.token)}.json`;
    expect(readFileSync(join(home, fname), "utf-8")).toContain("persisted failure");

    vi.resetModules();
    const { buildHealthSnapshot } = await import("../health.js");
    const s = await buildHealthSnapshot();
    expect(s.configured).toBe(true);
    expect(s.persisted?.recent_errors.join(" ")).toContain("persisted failure");
    expect(s.state_file_paths.some((p) => p.endsWith(".json"))).toBe(true);
  });
});
