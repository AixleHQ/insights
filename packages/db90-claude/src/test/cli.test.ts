import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("returns defaults with no args", () => {
    const args = parseArgs(["node", "cli.js"]);
    expect(args.dryRun).toBe(false);
    expect(args.verbose).toBe(false);
    expect(args.help).toBe(false);
    expect(args.watch).toBe(false);
    expect(args.watchInterval).toBe(30);
    expect(args.token).toBeUndefined();
    expect(args.host).toBeUndefined();
  });

  it("parses --token", () => {
    const args = parseArgs(["node", "cli.js", "--token", "abc123"]);
    expect(args.token).toBe("abc123");
  });

  it("parses --token=value", () => {
    const args = parseArgs(["node", "cli.js", "--token=abc123"]);
    expect(args.token).toBe("abc123");
  });

  it("parses --host", () => {
    const args = parseArgs(["node", "cli.js", "--host", "http://localhost:3000"]);
    expect(args.host).toBe("http://localhost:3000");
  });

  it("parses --host=value", () => {
    const args = parseArgs(["node", "cli.js", "--host=http://localhost:3000"]);
    expect(args.host).toBe("http://localhost:3000");
  });

  it("parses --dry-run", () => {
    const args = parseArgs(["node", "cli.js", "--dry-run"]);
    expect(args.dryRun).toBe(true);
  });

  it("parses --watch", () => {
    const args = parseArgs(["node", "cli.js", "--watch"]);
    expect(args.watch).toBe(true);
  });

  it("parses --watch-interval", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "60"]);
    expect(args.watchInterval).toBe(60);
  });

  it("parses --watch-interval=value", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval=120"]);
    expect(args.watchInterval).toBe(120);
  });

  it("parses --verbose", () => {
    const args = parseArgs(["node", "cli.js", "--verbose"]);
    expect(args.verbose).toBe(true);
  });

  it("parses -v as --verbose", () => {
    const args = parseArgs(["node", "cli.js", "-v"]);
    expect(args.verbose).toBe(true);
  });

  it("parses --help", () => {
    const args = parseArgs(["node", "cli.js", "--help"]);
    expect(args.help).toBe(true);
  });

  it("parses -h as --help", () => {
    const args = parseArgs(["node", "cli.js", "-h"]);
    expect(args.help).toBe(true);
  });

  it("parses multiple flags", () => {
    const args = parseArgs([
      "node",
      "cli.js",
      "--token",
      "tok",
      "--host",
      "http://example.com",
      "--dry-run",
      "--verbose",
    ]);
    expect(args.token).toBe("tok");
    expect(args.host).toBe("http://example.com");
    expect(args.dryRun).toBe(true);
    expect(args.verbose).toBe(true);
  });
});
