import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installClaudeUserMcp,
  desiredDb90McpEntry,
  db90EntryMatchesDesired,
} from "../install/claude.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "db90-install-"));
}

describe("installClaudeUserMcp", () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = tempDir();
    configPath = join(dir, "claude.json");
  });

  afterEach(() => {
    // temp dirs left behind; OS cleans periodically
  });

  it("creates a new config with db90 when the file does not exist", () => {
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "installed" });
    const json = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: { db90: { command: string; args: string[] } };
    };
    expect(json.mcpServers.db90).toEqual(desiredDb90McpEntry());
  });

  it("merges without removing unrelated top-level keys or other MCP servers", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        keepMe: true,
        projects: { "/x": { note: 1 } },
        mcpServers: {
          other: { command: "echo", args: ["hi"] },
        },
      }),
      "utf-8"
    );
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "installed" });
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    expect(data.keepMe).toBe(true);
    expect(data.projects).toEqual({ "/x": { note: 1 } });
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers.other).toEqual({ command: "echo", args: ["hi"] });
    expect(servers.db90).toEqual(desiredDb90McpEntry());
  });

  it("is a no-op when db90 already matches desired", () => {
    const desired = desiredDb90McpEntry();
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { db90: desired }, meta: 1 }),
      "utf-8"
    );
    const before = readFileSync(configPath, "utf-8");
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "already-configured" });
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("refuses to overwrite a mismatched db90 entry without force", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          db90: { command: "node", args: ["./local.js"] },
        },
      }),
      "utf-8"
    );
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r.kind).toBe("requires-force");
    if (r.kind === "requires-force") {
      expect(r.detail).toContain("--force");
    }
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: { db90: { command: string } };
    };
    expect(data.mcpServers.db90.command).toBe("node");
  });

  it("overwrites only db90 with --force and preserves neighbors", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          db90: { command: "node", args: ["./local.js"] },
          keep: { command: "true", args: [] },
        },
      }),
      "utf-8"
    );
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: true });
    expect(r).toEqual({ kind: "installed" });
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(data.mcpServers.db90).toEqual(desiredDb90McpEntry());
    expect(data.mcpServers.keep).toEqual({ command: "true", args: [] });
  });

  it("returns error when file is invalid JSON", () => {
    writeFileSync(configPath, "{not-json", "utf-8");
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r.kind).toBe("error");
  });

  it("returns error when mcpServers is not an object", () => {
    writeFileSync(configPath, JSON.stringify({ mcpServers: [] }), "utf-8");
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r.kind).toBe("error");
  });
});

describe("desiredDb90McpEntry", () => {
  it("uses cmd /c npx on Windows", () => {
    expect(desiredDb90McpEntry("win32")).toEqual({
      command: "cmd",
      args: ["/c", "npx", "-y", "@db90/telemetry-mcp", "run"],
    });
  });

  it("uses plain npx on POSIX", () => {
    expect(desiredDb90McpEntry("darwin")).toEqual({
      command: "npx",
      args: ["-y", "@db90/telemetry-mcp", "run"],
    });
  });
});

describe("db90EntryMatchesDesired", () => {
  it("matches when extra keys exist but command/args match", () => {
    const d = desiredDb90McpEntry("linux");
    expect(
      db90EntryMatchesDesired(
        { command: d.command, args: d.args, env: { FOO: "bar" } },
        d
      )
    ).toBe(true);
  });
});

describe("installEditorMcp dispatch", () => {
  it("delegates claude to installClaudeUserMcp", async () => {
    const { installEditorMcp } = await import("../install/index.js");
    const dir = tempDir();
    const p = join(dir, "c.json");
    const r = installEditorMcp("claude", { claudeConfigPath: p });
    expect(r).toEqual({ kind: "installed" });
    expect(existsSync(p)).toBe(true);
  });
});
