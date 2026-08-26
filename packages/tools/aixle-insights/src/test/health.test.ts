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
    process.env.AIXLE_INSIGHTS_HOME = home;
    process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR = "true";
    mkdirSync(home, { recursive: true });
    // Redirect homedir() to the sandbox so verifyHooksConfig() reads an
    // isolated ~/.cursor/hooks.json instead of the developer's real one.
    vi.resetModules();
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => home };
    });
  });

  afterEach(() => {
    delete process.env.AIXLE_INSIGHTS_HOME;
    delete process.env.AIXLE_INSIGHTS_MCP_DISABLE_KEYTAR;
    vi.doUnmock("node:os");
    vi.resetModules();
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

  it("surfaces organization_id from stored credentials", async () => {
    const ORG_A = "11111111-2222-3333-4444-555555555555";
    const host = "http://localhost:3000";
    writeFileSync(
      join(home, "credentials.json"),
      JSON.stringify({
        version: 2,
        host,
        organizationId: ORG_A,
        accounts: { claude_code: "db90_test" },
      }),
      "utf-8"
    );

    vi.resetModules();
    const { buildHealthSnapshot, healthSnapshotToStatusPayload, formatHealthForCli } =
      await import("../health.js");
    const snap = await buildHealthSnapshot();

    expect(snap.organization_id).toBe(ORG_A);
    expect(healthSnapshotToStatusPayload(snap).organization_id).toBe(ORG_A);
    expect(formatHealthForCli(snap)).toContain(`organization_id: ${ORG_A}`);
  });

  it("reports hooks installation status and queue depth", async () => {
    writeFileSync(
      join(home, "hooks-queue.ndjson"),
      JSON.stringify({
        captured_at: "2026-05-27T00:00:00.000Z",
        hook_event_name: "sessionEnd",
        conversation_id: "cmp-1",
        model: "claude-sonnet-4-20250514",
        workspace_roots: ["/tmp/repo"],
      }) + "\n",
      "utf-8"
    );

    vi.resetModules();
    const { buildHealthSnapshot } = await import("../health.js");
    const s = await buildHealthSnapshot();

    expect(s.hooks_installed).toBe(false);
    expect(s.hooks_queue_depth).toBe(1);
  });
});
