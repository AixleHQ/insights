/**
 * Refactor parity tests — AIX-aixle-insights migration.
 *
 * Anchor for the @db90/* → @aixle/insights rename. Each test asserts a
 * structural contract that must be preserved across the rename. The TEST
 * STRUCTURE never changes — only the EXPECTED_* constants flip at the
 * relevant commit (see plans/aixle-insights-migration/task-000.md).
 *
 * Baseline values (today, before any rename commit lands):
 *   EXPECTED_NPM_NAME      = "@db90/telemetry-mcp"
 *   EXPECTED_BIN           = "db90-mcp"
 *   EXPECTED_MCP_KEY       = "db90"
 *   EXPECTED_OBSOLETE_KEY  = null   (no delete-old-key shim yet — enabled in commit 8)
 *   EXPECTED_STATE_DIR     = ".db90-mcp"
 *   EXPECTED_KEYTAR        = "db90-mcp"
 *   EXPECTED_SERVER_NAME   = "db90-mcp"
 *
 * Target values (after the full rename):
 *   EXPECTED_NPM_NAME      = "@aixle/insights"
 *   EXPECTED_BIN           = "aixle-insights"
 *   EXPECTED_MCP_KEY       = "aixle-insights"
 *   EXPECTED_OBSOLETE_KEY  = "db90"   (commit 8 enables the shim-behavior test)
 *   EXPECTED_STATE_DIR     = ".aixle-insights"
 *   EXPECTED_KEYTAR        = "aixle-insights"
 *   EXPECTED_SERVER_NAME   = "aixle-insights-mcp"
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { installClaudeUserMcp } from "../install/claude.js";
import { getAppDir } from "../state.js";
import { KEYTAR_SERVICE } from "../auth/credentials.js";
import { SERVER_NAME } from "../server.js";
import { mapTranscriptTurn, type ClaudeTranscriptTurn } from "../readers/claude.js";

// =====================================================================
// Constants — flip these in the relevant rename commit
// =====================================================================

const EXPECTED_PKG_NAME = "@aixle/insights"; // flipped in commit 4
const EXPECTED_SPAWN_NPM_NAME = "@aixle/insights"; // flipped in commit 6 (install/claude.ts spawn args)
const EXPECTED_BIN = "aixle-insights";
const EXPECTED_MCP_KEY = "aixle-insights";
const EXPECTED_OBSOLETE_KEY: string | null = "db90";
const EXPECTED_STATE_DIR = ".aixle-insights";
const EXPECTED_KEYTAR = "aixle-insights";
const EXPECTED_SERVER_NAME = "aixle-insights-mcp";

// =====================================================================
// Helpers
// =====================================================================

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(here, "..", "..", "package.json");

function readPackageJson(): Record<string, unknown> {
  const raw = readFileSync(packageJsonPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function makeTurn(overrides: Partial<ClaudeTranscriptTurn> = {}): ClaudeTranscriptTurn {
  return {
    sessionId: "parity-session",
    turnId: "parity-session:1",
    filePath: "/tmp/parity.jsonl",
    fileSize: 0,
    model: "claude-sonnet-4-6",
    tokensIn: 100,
    tokensOut: 50,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    occurredAt: "2026-06-09T18:00:00.000Z",
    promptText: "parity-prompt",
    assistantText: "parity-response",
    riskLevel: "low",
    riskScore: 0,
    riskCategories: [],
    ...overrides,
  };
}

// =====================================================================
// Parity tests
// =====================================================================

describe("Refactor parity — package.json metadata", () => {
  it("npm package `name` matches expected (locks the rename in package.json)", () => {
    const pkg = readPackageJson();
    expect(pkg.name).toBe(EXPECTED_PKG_NAME);
  });

  it("package.json `bin` has exactly one entry with the expected key", () => {
    const pkg = readPackageJson();
    expect(pkg.bin).toBeTypeOf("object");
    const bin = pkg.bin as Record<string, string>;
    const binKeys = Object.keys(bin);
    expect(binKeys).toHaveLength(1);
    expect(binKeys[0]).toBe(EXPECTED_BIN);
  });
});

describe("Refactor parity — install/claude.ts integration", () => {
  it("installClaudeUserMcp writes mcpServers.<EXPECTED_MCP_KEY> with command=npx and args containing the expected npm name + 'run'", () => {
    const dir = mkdtempSync(join(tmpdir(), "parity-install-"));
    const claudeConfigPath = join(dir, "claude.json");

    try {
      const result = installClaudeUserMcp({ claudeConfigPath });
      expect(result.kind).toBe("installed");

      const written = JSON.parse(readFileSync(claudeConfigPath, "utf-8")) as Record<string, unknown>;
      const mcpServers = written.mcpServers as Record<string, unknown>;
      const entry = mcpServers[EXPECTED_MCP_KEY] as { command: string; args: string[] } | undefined;

      expect(entry).toBeDefined();
      expect(entry!.command).toMatch(/^(npx|cmd)$/);
      expect(entry!.args).toEqual(expect.arrayContaining([EXPECTED_SPAWN_NPM_NAME, "run"]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("install removes the obsolete MCP key when the delete-old-key shim is enabled (only meaningful post-task-16)", () => {
    if (EXPECTED_OBSOLETE_KEY === null) {
      // Shim not enabled yet (commits 0–7). Skipping the assertion is the
      // correct behavior — the obsolete key is the EXPECTED_MCP_KEY today
      // and we don't want to delete it.
      expect(true).toBe(true);
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "parity-shim-"));
    const claudeConfigPath = join(dir, "claude.json");
    try {
      // Seed the tmp file with an existing obsolete entry under the legacy key.
      const seed = {
        mcpServers: {
          [EXPECTED_OBSOLETE_KEY]: {
            command: "npx",
            args: ["-y", "@db90/telemetry-mcp", "run"],
          },
        },
      };
      writeFileSync(claudeConfigPath, `${JSON.stringify(seed, null, 2)}\n`, "utf-8");

      const result = installClaudeUserMcp({ claudeConfigPath });
      expect(result.kind).toBe("installed");

      const written = JSON.parse(readFileSync(claudeConfigPath, "utf-8")) as Record<string, unknown>;
      const mcpServers = written.mcpServers as Record<string, unknown>;
      expect(mcpServers[EXPECTED_OBSOLETE_KEY]).toBeUndefined();
      expect(mcpServers[EXPECTED_MCP_KEY]).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Refactor parity — state directory", () => {
  it("getAppDir returns ~/<EXPECTED_STATE_DIR>", () => {
    // getAppDir respects AIXLE_INSIGHTS_HOME / AIXLE_INSIGHTS_HOME env override, so
    // unset both to assert the default-derivation path.
    const savedAixleHome = process.env.AIXLE_INSIGHTS_HOME;
    delete process.env.AIXLE_INSIGHTS_HOME;

    try {
      expect(getAppDir()).toBe(join(homedir(), EXPECTED_STATE_DIR));
    } finally {
      if (savedAixleHome !== undefined) process.env.AIXLE_INSIGHTS_HOME = savedAixleHome;
    }
  });
});

describe("Refactor parity — auth + server identity", () => {
  it("KEYTAR_SERVICE constant matches expected", () => {
    expect(KEYTAR_SERVICE).toBe(EXPECTED_KEYTAR);
  });

  it("SERVER_NAME constant matches expected", () => {
    expect(SERVER_NAME).toBe(EXPECTED_SERVER_NAME);
  });
});

describe("Refactor parity — payload schema (Claude transcript turn)", () => {
  it("mapTranscriptTurn returns the exact key set the server contract expects", () => {
    const payload = mapTranscriptTurn(makeTurn());

    // Top-level keys: tool_name, event_type, occurred_at, model, tokens_in,
    // tokens_out, tokens_total, cost_usd (null when no pricing), metadata.
    expect(payload.tool_name).toBe("claude_code");
    expect(payload.event_type).toBe("chat");
    expect(typeof payload.occurred_at).toBe("string");
    expect(payload.model).toBe("claude-sonnet-4-6");
    expect(payload.tokens_in).toBe(100);
    expect(payload.tokens_out).toBe(50);
    expect(payload.tokens_total).toBe(150);
    // cost_usd may be 0 when no pricing table is provided in test mode; just
    // verify the key exists (server-side enrichment is responsible for filling).
    expect("cost_usd" in payload).toBe(true);

    // Metadata key set is part of the wire contract.
    expect(payload.metadata).toBeDefined();
    expect(payload.metadata.transcript_source).toBe("claude_jsonl");
    expect(payload.metadata.session_id).toBe("parity-session:1");
    expect(payload.metadata.scannable).toBe(true);
    expect(payload.metadata.model).toBe("claude-sonnet-4-6");
    expect(typeof payload.metadata.base_input_tokens).toBe("number");
  });
});
