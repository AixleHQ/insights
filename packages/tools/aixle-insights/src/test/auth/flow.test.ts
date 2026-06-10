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

vi.mock("../../auth/exchange.js", () => ({
  exchangeIngestToken,
}));

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
});
