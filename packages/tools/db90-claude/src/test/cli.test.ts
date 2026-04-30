import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs, loadConfig } from "../cli.js";

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

  it("parses --project-id", () => {
    const args = parseArgs(["node", "cli.js", "--project-id", "abc123"]);
    expect(args.projectId).toBe("abc123");
  });

  it("parses --project-id=value", () => {
    const args = parseArgs(["node", "cli.js", "--project-id=abc123"]);
    expect(args.projectId).toBe("abc123");
  });

  it("leaves projectId undefined when not provided", () => {
    const args = parseArgs(["node", "cli.js"]);
    expect(args.projectId).toBeUndefined();
  });
});

describe("loadConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "db90-cli-config-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns empty config when config file does not exist", () => {
    const config = loadConfig(testDir);
    expect(config.token).toBeUndefined();
    expect(config.host).toBeUndefined();
    expect(config.pricing).toBeUndefined();
  });

  it("reads token and host from config file", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: "my-token", host: "https://app.db90.io" }),
      "utf-8"
    );
    const config = loadConfig(testDir);
    expect(config.token).toBe("my-token");
    expect(config.host).toBe("https://app.db90.io");
  });

  it("reads a pricing table from config", () => {
    const pricing = {
      "claude-sonnet-4-6": {
        input_per_mtok: 3.0,
        output_per_mtok: 15.0,
        cache_write_per_mtok: 3.75,
        cache_read_per_mtok: 0.3,
      },
    };
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: "tok", pricing }),
      "utf-8"
    );
    const config = loadConfig(testDir);
    expect(config.pricing).toEqual(pricing);
  });

  it("returns pricing: undefined when pricing key is not an object", () => {
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({ token: "tok", pricing: "invalid" }),
      "utf-8"
    );
    const config = loadConfig(testDir);
    expect(config.pricing).toBeUndefined();
  });

  it("returns empty config for malformed JSON", () => {
    writeFileSync(join(testDir, "config.json"), "not-json", "utf-8");
    const config = loadConfig(testDir);
    expect(config.token).toBeUndefined();
    expect(config.pricing).toBeUndefined();
  });
});

describe("parseArgs — watch-interval security", () => {
  it("non-numeric value falls back to default 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "abc"]);
    expect(args.watchInterval).toBe(30);
  });

  it("negative value falls back to default 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "-100"]);
    expect(args.watchInterval).toBe(30);
  });

  it("zero falls back to default 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "0"]);
    expect(args.watchInterval).toBe(30);
  });

  it("empty string via = form falls back to default 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval="]);
    expect(args.watchInterval).toBe(30);
  });

  it("float string is truncated by parseInt and accepted if >= 1", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "60.9"]);
    expect(args.watchInterval).toBe(60);
  });

  it("large positive value is accepted as-is", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "999999999"]);
    expect(args.watchInterval).toBe(999999999);
  });

  it("NaN string (e.g. 'NaN') falls back to 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval", "NaN"]);
    expect(args.watchInterval).toBe(30);
  });

  it("equals-form non-numeric falls back to 30", () => {
    const args = parseArgs(["node", "cli.js", "--watch-interval=evil"]);
    expect(args.watchInterval).toBe(30);
  });
});
