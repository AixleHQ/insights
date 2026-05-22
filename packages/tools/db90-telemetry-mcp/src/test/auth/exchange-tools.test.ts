import { describe, expect, it, vi, afterEach } from "vitest";
import { exchangeIngestToken } from "../../auth/exchange.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchangeIngestToken (multi-tool)", () => {
  it("posts tools[] and merges accounts payloads", async () => {
    const tokA = `db90_${"aa".repeat(32)}`;
    const tokB = `db90_${"bb".repeat(32)}`;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ingestHost: "http://localhost:3000",
            organizationId: "org-multi",
            accounts: {
              claude_code: { ingestToken: tokA },
              cursor: { ingestToken: tokB },
            },
          },
        }),
        { status: 201 }
      )
    );

    const out = await exchangeIngestToken({
      db90Host: "http://localhost:3000",
      keycloakAccessToken: "kc-secret",
      tools: ["claude_code", "cursor"],
      deviceLabel: "unit test multi",
      fetchImpl,
    });

    expect(out.accounts.claude_code?.ingestToken).toBe(tokA);
    expect(out.accounts.cursor?.ingestToken).toBe(tokB);
    expect(out.ingestHost).toBe("http://localhost:3000");
    expect(out.organizationId).toBe("org-multi");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({
      tools: ["claude_code", "cursor"],
      device_label: "unit test multi",
    });
  });

  it("rejects a partial accounts payload when one requested tool is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ingestHost: "http://localhost:3000",
            organizationId: "org-multi",
            accounts: {
              claude_code: { ingestToken: `db90_${"aa".repeat(32)}` },
            },
          },
        }),
        { status: 201 }
      )
    );

    await expect(
      exchangeIngestToken({
        db90Host: "http://localhost:3000",
        keycloakAccessToken: "kc-secret",
        tools: ["claude_code", "cursor"],
        fetchImpl,
      })
    ).rejects.toThrow("missing requested account(s): cursor");
  });
});
