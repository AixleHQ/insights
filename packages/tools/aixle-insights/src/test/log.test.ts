import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendMcpLogLine, getMcpLogPath, MCP_LOG_MAX_BYTES } from "../log.js";

describe("mcp file log", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "db90-mcp-log-"));
    process.env.DB90_MCP_HOME = home;
  });

  afterEach(() => {
    delete process.env.DB90_MCP_HOME;
  });

  it("creates mcp.log under DB90_MCP_HOME", () => {
    appendMcpLogLine(JSON.stringify({ x: 1 }), home);
    const p = getMcpLogPath(home);
    const text = readFileSync(p, "utf-8").trim();
    expect(text).toContain('"x":1');
  });

  it("rotates to mcp.log.1 when growth would exceed the cap", () => {
    const logPath = getMcpLogPath(home);
    mkdirSync(home, { recursive: true });
    const filler = "y".repeat(MCP_LOG_MAX_BYTES - 1);
    writeFileSync(logPath, filler, "utf-8");
    const rotated = join(home, "mcp.log.1");
    appendMcpLogLine("rotated-new-line", home);
    expect(statSync(rotated).size).toBeGreaterThan(0);
    expect(readFileSync(logPath, "utf-8")).toContain("rotated-new-line");
  });

  it("caps the active log even for one oversized line", () => {
    const logPath = getMcpLogPath(home);
    appendMcpLogLine("z".repeat(MCP_LOG_MAX_BYTES + 1024), home);
    expect(statSync(logPath).size).toBeLessThanOrEqual(MCP_LOG_MAX_BYTES);
  });
});
