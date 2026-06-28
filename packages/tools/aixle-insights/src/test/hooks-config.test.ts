import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("hooks config install/uninstall", () => {
  let home: string;
  let appDir: string;
  let srcForwarder: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "db90-hooks-home-"));
    appDir = mkdtempSync(join(tmpdir(), "db90-hooks-app-"));
    srcForwarder = join(appDir, "src-forwarder.mjs");
    writeFileSync(srcForwarder, "#!/usr/bin/env node\n", "utf-8");
    vi.resetModules();
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => home };
    });
  });

  afterEach(() => {
    vi.doUnmock("node:os");
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
    rmSync(appDir, { recursive: true, force: true });
  });

  it("copies the forwarder, backs up hooks.json, and encodes the forwarder + app-dir in a single command string", async () => {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const existingHooks = join(cursorDir, "hooks.json");
    writeFileSync(existingHooks, JSON.stringify({ version: 1, hooks: { sessionEnd: [] } }), "utf-8");

    const mod = await import("../hooks/hooks-config.js");
    const result = mod.installHooksConfig(srcForwarder, appDir);

    expect(readFileSync(result.forwarderInstalled, "utf-8")).toContain("#!/usr/bin/env node");
    expect(result.backupPath).toBe(existingHooks + mod.HOOKS_BACKUP_SUFFIX);
    expect(readFileSync(result.backupPath!, "utf-8")).toContain("sessionEnd");

    const config = JSON.parse(readFileSync(existingHooks, "utf-8"));
    const entry = config.hooks.sessionEnd[0];
    // Cursor's schema has no args/env: command is a single shell string.
    expect(entry.args).toBeUndefined();
    expect(entry.env).toBeUndefined();
    expect(entry.command).toContain(join(appDir, mod.FORWARDER_FILENAME));
    expect(entry.command).toContain(`--app-dir`);
    expect(entry.command).toContain(appDir);
    expect(entry.command.startsWith("node ")).toBe(true);
    expect(config.hooks.postToolUse[0].command).toContain(join(appDir, mod.FORWARDER_FILENAME));
  });

  it("restores the backup and warns when queued hook events remain", async () => {
    const cursorDir = join(home, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const existingHooks = join(cursorDir, "hooks.json");
    const original = { version: 1, hooks: { sessionEnd: [{ command: "original" }] } };
    writeFileSync(existingHooks, JSON.stringify(original), "utf-8");
    writeFileSync(join(appDir, "hooks-queue.ndjson"), JSON.stringify({ hook_event_name: "sessionEnd" }) + "\n", "utf-8");

    const mod = await import("../hooks/hooks-config.js");
    mod.installHooksConfig(srcForwarder, appDir);
    const result = mod.uninstallHooksConfig(appDir);

    expect(result.restored).toBe(true);
    expect(result.backupPath).toBe(existingHooks + mod.HOOKS_BACKUP_SUFFIX);
    expect(JSON.parse(readFileSync(existingHooks, "utf-8"))).toEqual(original);
    expect(result.queueWarning).toContain("1 unprocessed event");
  });
});
