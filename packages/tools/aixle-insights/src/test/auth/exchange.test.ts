import { describe, expect, it, vi, afterEach } from "vitest";
import { exchangeIngestToken } from "../../auth/exchange.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchangeIngestToken", () => {
  it("posts Bearer Keycloak token and snake_case body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ingestToken: `db90_${"ab".repeat(32)}`,
            ingestHost: "http://localhost:3000",
            organizationId: "org-uuid-1",
          },
        }),
        { status: 201 }
      )
    );

    const out = await exchangeIngestToken({
      db90Host: "http://localhost:3000",
      keycloakAccessToken: "kc-secret",
      toolName: "claude_code",
      deviceLabel: "unit test",
      fetchImpl,
    });

    expect(out.ingestToken.startsWith("db90_")).toBe(true);
    expect(out.ingestHost).toBe("http://localhost:3000");
    expect(out.organizationId).toBe("org-uuid-1");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/integrations/mcp/exchange",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer kc-secret",
          "Content-Type": "application/json",
        }),
      })
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ tool_name: "claude_code", device_label: "unit test" });
    const headers = (fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers["X-Organization-ID"]).toBeUndefined();
  });

  it("sends X-Organization-ID when exchangeOrganizationId is set", async () => {
    const orgUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ingestToken: `db90_${"ab".repeat(32)}`,
            ingestHost: "http://localhost:3000",
            organizationId: orgUuid,
          },
        }),
        { status: 201 }
      )
    );

    await exchangeIngestToken({
      db90Host: "http://localhost:3000",
      keycloakAccessToken: "kc-secret",
      toolName: "claude_code",
      exchangeOrganizationId: orgUuid,
      fetchImpl,
    });

    const headers = (fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers["X-Organization-ID"]).toBe(orgUuid);
    expect(headers.Authorization).toBe("Bearer kc-secret");
  });

  it("throws OrganizationSelectionRequiredError with the org list on 422 organization_selection_required", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "organization_selection_required",
          message: "You belong to 2 organizations...",
          organizations: [
            { id: "11111111-1111-1111-1111-111111111111", name: "Acme", role: "owner" },
            { id: "22222222-2222-2222-2222-222222222222", name: "Globex", role: "member" },
          ],
        }),
        { status: 422 }
      )
    );

    await expect(
      exchangeIngestToken({
        db90Host: "https://api.example",
        keycloakAccessToken: "tok",
        toolName: "claude_code",
        fetchImpl,
      })
    ).rejects.toMatchObject({
      name: "OrganizationSelectionRequiredError",
      organizations: [{ name: "Acme" }, { name: "Globex" }],
    });
  });

  it("skips null/non-object organizations entries without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "organization_selection_required",
          message: "You belong to 1 organizations...",
          organizations: [null, { id: "11111111-1111-1111-1111-111111111111", name: "Acme", role: "owner" }, "x"],
        }),
        { status: 422 }
      )
    );

    await expect(
      exchangeIngestToken({
        db90Host: "https://api.example",
        keycloakAccessToken: "tok",
        toolName: "claude_code",
        fetchImpl,
      })
    ).rejects.toMatchObject({
      name: "OrganizationSelectionRequiredError",
      organizations: [{ id: "11111111-1111-1111-1111-111111111111", name: "Acme", role: "owner" }],
    });
  });

  it("maps a legacy flat token response to the requested cursor tool", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ingestToken: `db90_${"cd".repeat(32)}`,
            ingestHost: "http://localhost:3000",
            organizationId: "org-uuid-1",
          },
        }),
        { status: 201 }
      )
    );

    const out = await exchangeIngestToken({
      db90Host: "http://localhost:3000",
      keycloakAccessToken: "kc-secret",
      toolName: "cursor",
      fetchImpl,
    });

    expect(out.accounts.cursor?.ingestToken.startsWith("db90_")).toBe(true);
    expect(out.accounts.claude_code).toBeUndefined();
  });
});
