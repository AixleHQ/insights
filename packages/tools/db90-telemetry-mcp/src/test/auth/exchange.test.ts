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
