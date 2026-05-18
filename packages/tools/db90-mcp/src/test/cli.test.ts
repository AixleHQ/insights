import { describe, it, expect } from "vitest";
import { parseArgs, runOnce } from "../cli.js";
import { DEFAULT_PRICING } from "../pricing.js";

describe("parseArgs", () => {
  it("defaults to run when no command is given", () => {
    expect(parseArgs(["node", "cli.js"]).command).toBe("run");
  });

  it("recognises run / init / health subcommands", () => {
    expect(parseArgs(["node", "cli.js", "run"]).command).toBe("run");
    expect(parseArgs(["node", "cli.js", "init"]).command).toBe("init");
    expect(parseArgs(["node", "cli.js", "health"]).command).toBe("health");
  });

  it("maps serve to run for backward compatibility", () => {
    expect(parseArgs(["node", "cli.js", "serve"]).command).toBe("run");
  });

  it("treats unknown commands as help", () => {
    expect(parseArgs(["node", "cli.js", "frobnicate"]).command).toBe("help");
  });

  it("treats unknown flags as help instead of starting the server", () => {
    expect(parseArgs(["node", "cli.js", "--bogus"])).toEqual({
      command: "help",
      help: true,
      once: false,
    });
  });

  it("parses run --once", () => {
    expect(parseArgs(["node", "cli.js", "run", "--once"])).toEqual({
      command: "run",
      help: false,
      once: true,
    });
  });

  it("treats argv with only --once as run --once", () => {
    expect(parseArgs(["node", "cli.js", "--once"])).toEqual({
      command: "run",
      help: false,
      once: true,
    });
  });

  it("rejects --once with non-run commands", () => {
    expect(parseArgs(["node", "cli.js", "health", "--once"])).toEqual({
      command: "help",
      help: true,
      once: false,
    });
  });

  it("recognises --help and -h", () => {
    expect(parseArgs(["node", "cli.js", "--help"]).command).toBe("help");
    expect(parseArgs(["node", "cli.js", "-h"]).command).toBe("help");
    expect(parseArgs(["node", "cli.js", "health", "--help"]).help).toBe(true);
  });
});

describe("runOnce", () => {
  const creds = { token: "db90_test", host: "http://localhost:3000" };
  const silentOutput = {
    log: () => undefined,
    error: () => undefined,
  };

  it("returns non-zero when credentials are missing", async () => {
    const code = await runOnce({
      loadCredentials: () => null,
      ...silentOutput,
    });

    expect(code).toBe(1);
  });

  it("returns non-zero when the sync is locked", async () => {
    const code = await runOnce({
      loadCredentials: () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncOnce: async () => ({ sent: 0, failed: 0, skipped: 0, locked: true }),
      ...silentOutput,
    });

    expect(code).toBe(1);
  });

  it("returns non-zero when any event fails to post", async () => {
    const code = await runOnce({
      loadCredentials: () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncOnce: async () => ({ sent: 1, failed: 1, skipped: 0 }),
      ...silentOutput,
    });

    expect(code).toBe(1);
  });

  it("returns zero after a successful single sync", async () => {
    const code = await runOnce({
      loadCredentials: () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncOnce: async () => ({ sent: 1, failed: 0, skipped: 0 }),
      ...silentOutput,
    });

    expect(code).toBe(0);
  });

  it("prints the sync result after a successful single sync", async () => {
    const messages: string[] = [];

    const code = await runOnce({
      loadCredentials: () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncOnce: async () => ({ sent: 2, failed: 0, skipped: 3 }),
      log: (message) => messages.push(message),
      error: () => undefined,
    });

    expect(code).toBe(0);
    expect(messages).toContain("Sync complete: sent=2 failed=0 skipped=3");
  });
});
