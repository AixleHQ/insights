import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  installClaudeUserMcp,
  desiredAixleInsightsEntry,
  aixleInsightsEntryMatchesDesired,
  defaultClaudeUserConfigPath,
} from "../install/claude.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "aixle-insights-install-"));
}

describe("defaultClaudeUserConfigPath", () => {
  afterEach(() => {
    delete process.env.AIXLE_INSIGHTS_CLAUDE_USER_CONFIG_PATH;
    delete process.env.DB90_CLAUDE_USER_CONFIG_PATH;
  });

  it("defaults to ~/.claude.json when no override env var is set", () => {
    expect(defaultClaudeUserConfigPath()).toBe(join(homedir(), ".claude.json"));
  });

  it("prefers AIXLE_INSIGHTS_CLAUDE_USER_CONFIG_PATH over the deprecated DB90_CLAUDE_USER_CONFIG_PATH", () => {
    process.env.AIXLE_INSIGHTS_CLAUDE_USER_CONFIG_PATH = "/tmp/current.json";
    process.env.DB90_CLAUDE_USER_CONFIG_PATH = "/tmp/deprecated.json";
    expect(defaultClaudeUserConfigPath()).toBe("/tmp/current.json");
  });

  it("falls back to the deprecated DB90_CLAUDE_USER_CONFIG_PATH when the current name is unset", () => {
    process.env.DB90_CLAUDE_USER_CONFIG_PATH = "/tmp/deprecated.json";
    expect(defaultClaudeUserConfigPath()).toBe("/tmp/deprecated.json");
  });
});

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

  it("creates a new config with the aixle-insights entry when the file does not exist", () => {
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "installed" });
    const json = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(json.mcpServers["aixle-insights"]).toEqual(desiredAixleInsightsEntry());
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
    expect(servers["aixle-insights"]).toEqual(desiredAixleInsightsEntry());
  });

  it("is a no-op when aixle-insights already matches desired", () => {
    const desired = desiredAixleInsightsEntry();
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { "aixle-insights": desired }, meta: 1 }),
      "utf-8"
    );
    const before = readFileSync(configPath, "utf-8");
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "already-configured" });
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("refuses to overwrite a mismatched aixle-insights entry without force", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          "aixle-insights": { command: "node", args: ["./local.js"] },
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
      mcpServers: Record<string, { command: string }>;
    };
    expect(data.mcpServers["aixle-insights"].command).toBe("node");
  });

  it("overwrites only aixle-insights with --force and preserves neighbors", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          "aixle-insights": { command: "node", args: ["./local.js"] },
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
    expect(data.mcpServers["aixle-insights"]).toEqual(desiredAixleInsightsEntry());
    expect(data.mcpServers.keep).toEqual({ command: "true", args: [] });
  });

  it("delete-old-key shim: removes a pre-existing mcpServers.db90 and writes the new aixle-insights entry", () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          db90: { command: "npx", args: ["-y", "@db90/telemetry-mcp", "run"] },
          keep: { command: "true", args: [] },
        },
      }),
      "utf-8"
    );
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "installed" });
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(data.mcpServers["aixle-insights"]).toEqual(desiredAixleInsightsEntry());
    expect(data.mcpServers.db90).toBeUndefined();
    // Neighbors preserved.
    expect(data.mcpServers.keep).toEqual({ command: "true", args: [] });
  });

  it("delete-old-key shim runs even when the new entry already matches (cleans up partial-state from manual installs)", () => {
    const desired = desiredAixleInsightsEntry();
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          "aixle-insights": desired,
          db90: { command: "npx", args: ["-y", "@db90/telemetry-mcp", "run"] },
        },
      }),
      "utf-8"
    );
    const r = installClaudeUserMcp({ claudeConfigPath: configPath, force: false });
    expect(r).toEqual({ kind: "installed" });
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(data.mcpServers["aixle-insights"]).toEqual(desired);
    expect(data.mcpServers.db90).toBeUndefined();
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

describe("desiredAixleInsightsEntry", () => {
  it("uses cmd /c npx on Windows", () => {
    expect(desiredAixleInsightsEntry("win32")).toEqual({
      command: "cmd",
      args: ["/c", "npx", "-y", "@aixle/insights", "run"],
    });
  });

  it("uses plain npx on POSIX", () => {
    expect(desiredAixleInsightsEntry("darwin")).toEqual({
      command: "npx",
      args: ["-y", "@aixle/insights", "run"],
    });
  });
});

describe("aixleInsightsEntryMatchesDesired", () => {
  it("matches when extra keys exist but command/args match", () => {
    const d = desiredAixleInsightsEntry("linux");
    expect(
      aixleInsightsEntryMatchesDesired(
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
