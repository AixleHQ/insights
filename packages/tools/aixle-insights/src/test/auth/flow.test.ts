import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  exchangeIngestToken,
  obtainKeycloakAccessTokenViaDeviceFlow,
  loadCredentials,
  saveStoredCredentials,
} = vi.hoisted(() => ({
  exchangeIngestToken: vi.fn(),
  obtainKeycloakAccessTokenViaDeviceFlow: vi.fn(),
  loadCredentials: vi.fn(),
  saveStoredCredentials: vi.fn(),
}));

vi.mock("../../auth/exchange.js", async (importActual) => {
  const actual = await importActual<typeof import("../../auth/exchange.js")>();
  return {
    ...actual,
    exchangeIngestToken,
  };
});

vi.mock("../../auth/keycloak.js", () => ({
  defaultKeycloakClientId: () => "db90-cli",
  defaultKeycloakIssuer: () => "http://issuer.test",
  obtainKeycloakAccessTokenViaDeviceFlow,
}));

vi.mock("../../auth/credentials.js", () => ({
  loadCredentials,
  saveStoredCredentials,
}));

import { loginAndPersistCredentials } from "../../auth/flow.js";
import { OrganizationSelectionRequiredError } from "../../auth/exchange.js";

describe("loginAndPersistCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtainKeycloakAccessTokenViaDeviceFlow.mockResolvedValue("kc-token");
    loadCredentials.mockResolvedValue(null);
    saveStoredCredentials.mockResolvedValue(undefined);
  });

  it("merges newly exchanged single-tool credentials with existing sibling tool credentials", async () => {
    loadCredentials.mockResolvedValue({
      host: "http://localhost:3000",
      organizationId: "org-1",
      accounts: {
        cursor: "db90_cursor_old",
      },
    });
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://localhost:3000",
      organizationId: "org-1",
      ingestToken: "db90_claude_new",
      accounts: {
        claude_code: { ingestToken: "db90_claude_new" },
      },
    });

    const result = await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(result).toEqual({ ok: true, organizationId: "org-1" });
    expect(saveStoredCredentials).toHaveBeenCalledWith(
      {
        host: "http://localhost:3000",
        organizationId: "org-1",
        accounts: {
          claude_code: "db90_claude_new",
          cursor: "db90_cursor_old",
        },
      },
      "/tmp/db90-mcp-auth-flow-test"
    );
  });

  it("persists local HTTP ingestHost without requiring insecure opt-in or warning", async () => {
    const warnings: string[] = [];
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://127.0.0.1:3000",
      organizationId: "org-1",
      ingestToken: "db90_claude_new",
      accounts: {
        claude_code: { ingestToken: "db90_claude_new" },
      },
    });

    const result = await loginAndPersistCredentials({
      db90Host: "http://127.0.0.1:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
      onSecurityWarning: (message) => warnings.push(message),
    });

    expect(result).toEqual({ ok: true, organizationId: "org-1" });
    expect(warnings).toEqual([]);
    expect(saveStoredCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ host: "http://127.0.0.1:3000" }),
      "/tmp/db90-mcp-auth-flow-test"
    );
  });

  it("rejects a remote HTTP ingestHost returned by exchange before saving credentials", async () => {
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://api.example.com",
      organizationId: "org-1",
      ingestToken: "db90_claude_new",
      accounts: {
        claude_code: { ingestToken: "db90_claude_new" },
      },
    });

    const result = await loginAndPersistCredentials({
      db90Host: "https://api.example.com",
      keycloakIssuer: "https://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("api.example.com");
      expect(result.error).toContain("plaintext HTTP");
      expect(result.error).toContain("ingest tokens and telemetry");
      expect(result.error).toContain("HTTPS");
      expect(result.error).toContain("--insecure");
    }
    expect(saveStoredCredentials).not.toHaveBeenCalled();
  });

  it("allows a remote HTTP ingestHost with insecure opt-in and emits a warning", async () => {
    const warnings: string[] = [];
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://api.example.com",
      organizationId: "org-1",
      ingestToken: "db90_claude_new",
      accounts: {
        claude_code: { ingestToken: "db90_claude_new" },
      },
    });

    const result = await loginAndPersistCredentials({
      db90Host: "http://api.example.com",
      keycloakIssuer: "https://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
      allowInsecureHttp: true,
      onSecurityWarning: (message) => warnings.push(message),
    });

    expect(result).toEqual({ ok: true, organizationId: "org-1" });
    expect(warnings.join("\n")).toContain("api.example.com");
    expect(warnings.join("\n")).toContain("plaintext HTTP");
    expect(warnings.join("\n")).toContain("ingest tokens and telemetry");
    expect(warnings.join("\n")).toContain("HTTPS");
    expect(saveStoredCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ host: "http://api.example.com", insecureHttpAllowed: true }),
      "/tmp/db90-mcp-auth-flow-test"
    );
  });

  it("does not merge credentials from a different host", async () => {
    loadCredentials.mockResolvedValue({
      host: "http://other-host:3000",
      organizationId: "org-1",
      accounts: {
        cursor: "db90_cursor_old",
      },
    });
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://localhost:3000",
      organizationId: "org-2",
      ingestToken: "db90_claude_new",
      accounts: {
        claude_code: { ingestToken: "db90_claude_new" },
      },
    });

    await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(saveStoredCredentials).toHaveBeenCalledWith(
      {
        host: "http://localhost:3000",
        organizationId: "org-2",
        accounts: {
          claude_code: "db90_claude_new",
        },
      },
      "/tmp/db90-mcp-auth-flow-test"
    );
  });

  it("passes exchangeOrganizationId through to exchangeIngestToken", async () => {
    const orgUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://localhost:3000",
      organizationId: orgUuid,
      ingestToken: "db90_one",
      accounts: { claude_code: { ingestToken: "db90_one" } },
    });

    await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      exchangeOrganizationId: orgUuid,
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(exchangeIngestToken).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrganizationId: orgUuid,
        toolName: "claude_code",
      })
    );
  });

  it("returns a structured failure carrying organizations on org-selection 422", async () => {
    exchangeIngestToken.mockRejectedValue(
      new OrganizationSelectionRequiredError("You belong to 2 organizations...", [
        { id: "11111111-1111-1111-1111-111111111111", name: "Acme", role: "owner" },
        { id: "22222222-2222-2222-2222-222222222222", name: "Globex", role: "member" },
      ])
    );

    const result = await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "organization_selection_required",
      organizations: [{ name: "Acme" }, { name: "Globex" }],
    });
    expect(saveStoredCredentials).not.toHaveBeenCalled();
  });

  it("wipes previously-stored accounts when organizationId changes on re-init", async () => {
    const ORG_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    const ORG_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
    loadCredentials.mockResolvedValue({
      host: "http://localhost:3000",
      organizationId: ORG_A,
      accounts: {
        cursor: "db90_cursor_org_a",
      },
    });
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://localhost:3000",
      organizationId: ORG_B,
      ingestToken: "db90_claude_org_b",
      accounts: {
        claude_code: { ingestToken: "db90_claude_org_b" },
      },
    });

    await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(saveStoredCredentials).toHaveBeenCalledWith(
      {
        host: "http://localhost:3000",
        organizationId: ORG_B,
        accounts: {
          claude_code: "db90_claude_org_b",
        },
      },
      "/tmp/db90-mcp-auth-flow-test"
    );
  });

  it("keeps previously-stored accounts when organizationId is unchanged on re-init", async () => {
    const ORG_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    loadCredentials.mockResolvedValue({
      host: "http://localhost:3000",
      organizationId: ORG_A,
      accounts: {
        cursor: "db90_cursor_org_a",
      },
    });
    exchangeIngestToken.mockResolvedValue({
      ingestHost: "http://localhost:3000",
      organizationId: ORG_A,
      ingestToken: "db90_claude_org_a",
      accounts: {
        claude_code: { ingestToken: "db90_claude_org_a" },
      },
    });

    await loginAndPersistCredentials({
      db90Host: "http://localhost:3000",
      keycloakIssuer: "http://issuer.test",
      toolName: "claude_code",
      appDir: "/tmp/db90-mcp-auth-flow-test",
    });

    expect(saveStoredCredentials).toHaveBeenCalledWith(
      {
        host: "http://localhost:3000",
        organizationId: ORG_A,
        accounts: {
          claude_code: "db90_claude_org_a",
          cursor: "db90_cursor_org_a",
        },
      },
      "/tmp/db90-mcp-auth-flow-test"
    );
  });
});
