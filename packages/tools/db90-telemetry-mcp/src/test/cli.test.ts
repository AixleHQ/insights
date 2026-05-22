import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { parseArgs, runOnce, runInit, isValidDb90OrganizationUuid } from "../cli.js";
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

  it("parses init with --host and --keycloak-url", () => {
    const a = parseArgs(["node", "cli.js", "init", "--host", "http://api", "--keycloak-url", "http://kc/realms/db90"]);
    expect(a.command).toBe("init");
    expect(a.host).toBe("http://api");
    expect(a.keycloakUrl).toBe("http://kc/realms/db90");
    expect(
      parseArgs(["node", "cli.js", "init", "--host=http://api", "--keycloak-url=http://kc/r"]).host
    ).toBe("http://api");
  });

  it("treats init with unknown flags as help", () => {
    expect(parseArgs(["node", "cli.js", "init", "--bogus"]).command).toBe("help");
  });

  it("parses init --force", () => {
    expect(parseArgs(["node", "cli.js", "init", "--force"]).force).toBe(true);
  });

  it("treats init --force=false as help (force is boolean-only)", () => {
    expect(parseArgs(["node", "cli.js", "init", "--force=false"]).command).toBe("help");
  });

  it("treats init --force junk as help (no extra positional args)", () => {
    expect(parseArgs(["node", "cli.js", "init", "--force", "junk"]).command).toBe("help");
  });

  it("treats run --force as help (force is init-only)", () => {
    expect(parseArgs(["node", "cli.js", "run", "--force"]).command).toBe("help");
  });

  it("treats run --host as help (host is init-only)", () => {
    expect(parseArgs(["node", "cli.js", "run", "--host", "http://x"]).command).toBe("help");
  });
});

describe("isValidDb90OrganizationUuid", () => {
  it("accepts lowercase v4 UUID", () => {
    expect(isValidDb90OrganizationUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts uppercase", () => {
    expect(isValidDb90OrganizationUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isValidDb90OrganizationUuid("org-123")).toBe(false);
    expect(isValidDb90OrganizationUuid("")).toBe(false);
  });
});

describe("parseArgs init --organization-id", () => {
  it("parses --organization-id value form", () => {
    const u = "550e8400-e29b-41d4-a716-446655440000";
    const a = parseArgs([
      "node",
      "cli.js",
      "init",
      "--host",
      "http://api",
      "--keycloak-url",
      "http://kc/realms/db90",
      "--organization-id",
      u,
    ]);
    expect(a.command).toBe("init");
    expect(a.organizationId).toBe(u);
  });

  it("parses --organization-id=uuid", () => {
    const u = "550e8400-e29b-41d4-a716-446655440000";
    const a = parseArgs(["node", "cli.js", "init", "--organization-id=" + u, "--keycloak-url", "http://kc/r"]);
    expect(a.organizationId).toBe(u);
  });
});

describe("runOnce", () => {
  const creds = { host: "http://localhost:3000", accounts: { claude_code: "db90_test" } };
  const silentOutput = {
    log: () => undefined,
    error: () => undefined,
  };

  it("returns non-zero when credentials are missing", async () => {
    const home = mkdtempSync(join(tmpdir(), "db90-cli-missing-creds-"));
    process.env.DB90_MCP_HOME = home;
    try {
      const code = await runOnce({
        loadCredentials: async () => null,
        ...silentOutput,
      });

      expect(code).toBe(1);
      expect(readFileSync(join(home, "mcp.log"), "utf-8")).toContain("credential_validation_failed");
    } finally {
      delete process.env.DB90_MCP_HOME;
    }
  });

  it("returns non-zero when the sync is locked", async () => {
    const code = await runOnce({
      loadCredentials: async () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncTelemetryTools: async () => ({ sent: 0, failed: 0, skipped: 0, locked: true }),
      ...silentOutput,
    });

    expect(code).toBe(1);
  });

  it("returns non-zero when any event fails to post", async () => {
    const code = await runOnce({
      loadCredentials: async () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncTelemetryTools: async () => ({ sent: 1, failed: 1, skipped: 0 }),
      ...silentOutput,
    });

    expect(code).toBe(1);
  });

  it("returns zero after a successful single sync", async () => {
    const code = await runOnce({
      loadCredentials: async () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncTelemetryTools: async () => ({ sent: 1, failed: 0, skipped: 0 }),
      ...silentOutput,
    });

    expect(code).toBe(0);
  });

  it("prints the sync result after a successful single sync", async () => {
    const messages: string[] = [];

    const code = await runOnce({
      loadCredentials: async () => creds,
      migrateLegacyState: () => undefined,
      getAppDir: () => "/tmp/db90-mcp-test",
      pricing: DEFAULT_PRICING,
      syncTelemetryTools: async () => ({ sent: 2, failed: 0, skipped: 3 }),
      log: (message) => messages.push(message),
      error: () => undefined,
    });

    expect(code).toBe(0);
    expect(messages).toContain("Sync complete: sent=2 failed=0 skipped=3");
  });
});

describe("runInit", () => {
  it("calls install only after successful login", async () => {
    const events: string[] = [];
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
      },
      {
        loginAndPersistCredentials: async () => {
          events.push("login");
          return { ok: true, organizationId: "org-1" };
        },
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => {
          events.push("install");
          return { kind: "installed" };
        },
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
    expect(events).toEqual(["login", "install"]);
  });

  it("does not call install when login fails", async () => {
    let installCalled = false;
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
      },
      {
        loginAndPersistCredentials: async () => ({ ok: false, error: "bad auth" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => {
          installCalled = true;
          return { kind: "installed" };
        },
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(1);
    expect(installCalled).toBe(false);
  });

  it("returns 0 when login and Claude MCP install succeed", async () => {
    const installCalls: { force: boolean }[] = [];
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
        force: false,
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: (opts) => {
          installCalls.push({ force: opts.force === true });
          return { kind: "installed" };
        },
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
    expect(installCalls).toEqual([{ force: false }]);
  });

  it("returns non-zero when install fails after successful login (credentials must remain saved)", async () => {
    let loginCalled = false;
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
      },
      {
        loginAndPersistCredentials: async () => {
          loginCalled = true;
          return { ok: true, organizationId: "org-1" };
        },
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => ({ kind: "error", message: "disk full" }),
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(loginCalled).toBe(true);
    expect(code).toBe(1);
  });

  it("passes --force through to install", async () => {
    const forces: boolean[] = [];
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
        force: true,
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: (opts) => {
          forces.push(opts.force === true);
          return { kind: "installed" };
        },
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
    expect(forces).toEqual([true]);
  });

  it("prints Restart Claude Code to activate after successful init", async () => {
    const lines: string[] = [];
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => ({ kind: "installed" }),
        log: (m) => lines.push(m),
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("Restart Claude Code to activate"))).toBe(true);
  });

  it("skips Claude install for cursor toolName", async () => {
    let installCalled = false;
    const lines: string[] = [];
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "cursor",
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => {
          installCalled = true;
          return { kind: "installed" };
        },
        log: (m) => lines.push(m),
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
    expect(installCalled).toBe(false);
    expect(lines.some((l) => l.includes("Skipped Claude Code MCP auto-install"))).toBe(true);
    expect(lines.some((l) => l.includes("Restart Claude Code to activate"))).toBe(false);
  });

  it("returns 0 when login succeeds", async () => {
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "claude_code",
      },
      {
        loginAndPersistCredentials: async () => ({ ok: true, organizationId: "org-1" }),
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => ({ kind: "already-configured" }),
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(0);
  });

  it("rejects invalid tool names instead of coercing to claude_code", async () => {
    const code = await runInit(
      {
        command: "init",
        help: false,
        once: false,
        host: "http://localhost:3000",
        keycloakUrl: "http://localhost:8080/realms/db90",
        toolName: "github_copilot",
      },
      {
        loginAndPersistCredentials: async () => {
          throw new Error("should not authenticate");
        },
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => ({ kind: "installed" }),
        log: () => undefined,
        error: () => undefined,
      }
    );
    expect(code).toBe(1);
  });

  describe("exchange organization id", () => {
    let prevOrgEnv: string | undefined;

    beforeEach(() => {
      prevOrgEnv = process.env.DB90_ORGANIZATION_ID;
      delete process.env.DB90_ORGANIZATION_ID;
    });

    afterEach(() => {
      if (prevOrgEnv === undefined) {
        delete process.env.DB90_ORGANIZATION_ID;
      } else {
        process.env.DB90_ORGANIZATION_ID = prevOrgEnv;
      }
    });

    const baseArgs = {
      command: "init" as const,
      help: false,
      once: false,
      host: "http://localhost:3000",
      keycloakUrl: "http://localhost:8080/realms/db90",
      toolName: "claude_code",
    };

    it("returns 1 and skips login when --organization-id is not a valid UUID", async () => {
      let loginCalled = false;
      const errors: string[] = [];
      const code = await runInit(
        { ...baseArgs, organizationId: "not-a-uuid" },
        {
          loginAndPersistCredentials: async () => {
            loginCalled = true;
            return { ok: true, organizationId: "x" };
          },
          defaultKeycloakIssuer: () => "",
          getAppDir: () => "/tmp/db90-mcp-init-test",
          installClaudeUserMcp: () => ({ kind: "installed" }),
          log: () => undefined,
          error: (m) => errors.push(m),
        }
      );
      expect(code).toBe(1);
      expect(loginCalled).toBe(false);
      expect(errors.some((e) => e.includes("UUID"))).toBe(true);
    });

    it("prefers CLI --organization-id over DB90_ORGANIZATION_ID", async () => {
      process.env.DB90_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
      let exchangeOrganizationId: string | undefined;
      const code = await runInit(
        { ...baseArgs, organizationId: "11111111-2222-4222-8222-333333333333" },
        {
          loginAndPersistCredentials: async (opts) => {
            exchangeOrganizationId = opts.exchangeOrganizationId;
            return { ok: true, organizationId: "org-1" };
          },
          defaultKeycloakIssuer: () => "",
          getAppDir: () => "/tmp/db90-mcp-init-test",
          installClaudeUserMcp: () => ({ kind: "already-configured" }),
          log: () => undefined,
          error: () => undefined,
        }
      );
      expect(code).toBe(0);
      expect(exchangeOrganizationId).toBe("11111111-2222-4222-8222-333333333333");
    });

    it("passes DB90_ORGANIZATION_ID when flag is omitted", async () => {
      process.env.DB90_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
      let exchangeOrganizationId: string | undefined;
      const code = await runInit(baseArgs, {
        loginAndPersistCredentials: async (opts) => {
          exchangeOrganizationId = opts.exchangeOrganizationId;
          return { ok: true, organizationId: "org-1" };
        },
        defaultKeycloakIssuer: () => "",
        getAppDir: () => "/tmp/db90-mcp-init-test",
        installClaudeUserMcp: () => ({ kind: "already-configured" }),
        log: () => undefined,
        error: () => undefined,
      });
      expect(code).toBe(0);
      expect(exchangeOrganizationId).toBe("00000000-0000-4000-8000-000000000001");
    });
  });
});

describe("health CLI formatting", () => {
  it("includes log_path and app_dir from buildHealthSnapshot", async () => {
    const home = mkdtempSync(join(tmpdir(), "db90-health-cli-"));
    mkdirSync(home, { recursive: true });
    process.env.DB90_MCP_HOME = home;
    process.env.DB90_MCP_DISABLE_KEYTAR = "true";
    try {
      const { formatHealthForCli, buildHealthSnapshot } = await import("../health.js");
      const text = formatHealthForCli(await buildHealthSnapshot());
      expect(text).toContain("log_path:");
      expect(text).toContain(join(home, "mcp.log"));
      expect(text).toContain(`app_dir: ${home}`);
    } finally {
      delete process.env.DB90_MCP_HOME;
      delete process.env.DB90_MCP_DISABLE_KEYTAR;
    }
  });
});
