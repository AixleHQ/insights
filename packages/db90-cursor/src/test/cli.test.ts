import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("returns defaults when no args given", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result).toEqual({ dryRun: false, verbose: false, help: false });
  });

  it("parses --token and --host as separate args", () => {
    const result = parseArgs(["node", "cli.js", "--token", "tok123", "--host", "https://app.db90.io"]);
    expect(result.token).toBe("tok123");
    expect(result.host).toBe("https://app.db90.io");
  });

  it("parses --token=value and --host=value inline forms", () => {
    const result = parseArgs(["node", "cli.js", "--token=tok123", "--host=https://app.db90.io"]);
    expect(result.token).toBe("tok123");
    expect(result.host).toBe("https://app.db90.io");
  });

  it("parses --dry-run", () => {
    expect(parseArgs(["node", "cli.js", "--dry-run"]).dryRun).toBe(true);
  });

  it("parses --verbose", () => {
    expect(parseArgs(["node", "cli.js", "--verbose"]).verbose).toBe(true);
  });

  it("parses -v as verbose shorthand", () => {
    expect(parseArgs(["node", "cli.js", "-v"]).verbose).toBe(true);
  });

  it("parses --help", () => {
    expect(parseArgs(["node", "cli.js", "--help"]).help).toBe(true);
  });

  it("parses -h as help shorthand", () => {
    expect(parseArgs(["node", "cli.js", "-h"]).help).toBe(true);
  });

  it("parses --since", () => {
    expect(parseArgs(["node", "cli.js", "--since", "2026-01-01"]).since).toBe("2026-01-01");
  });

  it("parses --since=value inline form", () => {
    expect(parseArgs(["node", "cli.js", "--since=2026-01-01"]).since).toBe("2026-01-01");
  });

  it("parses all flags together", () => {
    const result = parseArgs([
      "node", "cli.js",
      "--token", "mytoken",
      "--host", "http://localhost:3000",
      "--dry-run",
      "--verbose",
      "--since", "2026-03-01",
    ]);
    expect(result.token).toBe("mytoken");
    expect(result.host).toBe("http://localhost:3000");
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.since).toBe("2026-03-01");
    expect(result.help).toBe(false);
  });

  it("ignores unknown flags", () => {
    const result = parseArgs(["node", "cli.js", "--unknown-flag", "value"]);
    expect(result.token).toBeUndefined();
    expect(result.dryRun).toBe(false);
  });
});
