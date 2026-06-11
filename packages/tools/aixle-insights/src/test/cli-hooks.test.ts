import { describe, expect, it, vi } from "vitest";

const hooksMocks = vi.hoisted(() => ({
  installHooksConfig: vi.fn(),
  uninstallHooksConfig: vi.fn(),
  verifyHooksConfig: vi.fn(),
}));

vi.mock("../hooks/hooks-config.js", () => ({
  installHooksConfig: hooksMocks.installHooksConfig,
  uninstallHooksConfig: hooksMocks.uninstallHooksConfig,
  verifyHooksConfig: hooksMocks.verifyHooksConfig,
  FORWARDER_FILENAME: "hook-forwarder.mjs",
}));

describe("CLI hooks flags", () => {
  it("parses init --hooks and hook subcommands", async () => {
    const { parseArgs } = await import("../cli.js");

    expect(parseArgs(["node", "cli.js", "init", "--hooks"]).hooks).toBe(true);
    expect(parseArgs(["node", "cli.js", "uninstall-hooks"]).command).toBe("uninstall-hooks");
    expect(parseArgs(["node", "cli.js", "verify-hooks"]).command).toBe("verify-hooks");
  });

  it("installs Cursor hooks during init --hooks and prints the restart reminder", async () => {
    hooksMocks.installHooksConfig.mockReturnValue({
      forwarderInstalled: "/tmp/db90-mcp/hook-forwarder.mjs",
      backupPath: "/tmp/home/.cursor/hooks.json.db90-backup",
    });

    const logs: string[] = [];
    const errors: string[] = [];
    const { runInit } = await import("../cli.js");

    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        hooks: true,
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "http://keycloak/realms/db90",
        getAppDir: () => "/tmp/db90-mcp",
        installClaudeUserMcp: () => ({ kind: "already-configured" }),
        log: (message) => logs.push(message),
        error: (message) => errors.push(message),
      }
    );

    expect(code).toBe(0);
    expect(hooksMocks.installHooksConfig).toHaveBeenCalledWith(
      expect.stringContaining("hook-forwarder.mjs"),
      "/tmp/db90-mcp"
    );
    expect(logs.join("\n")).toContain("Cursor hooks installed");
    expect(logs.join("\n")).toContain("Restart Cursor");
    expect(errors).toEqual([]);
  });
});
