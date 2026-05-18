import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MCP server (in-process)", () => {
  let home: string;

  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    vi.resetModules();
    const { createDb90McpServer } = await import("../server.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDb90McpServer();
    const client = new Client({ name: "db90-mcp-test-client", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name, arguments: args });
    const first = result.content[0];
    if (first?.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text) as unknown;

    await client.close();
    await server.close();
    return parsed;
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "db90-mcp-home-"));
    mkdirSync(home, { recursive: true });
    process.env.DB90_MCP_HOME = home;
    process.env.DB90_MCP_DISABLE_KEYTAR = "true";
  });

  afterEach(() => {
    delete process.env.DB90_MCP_HOME;
    delete process.env.DB90_MCP_DISABLE_KEYTAR;
    vi.restoreAllMocks();
  });

  it("listTools includes db90_authenticate, db90_status, and db90_sync_now", async () => {
    vi.resetModules();
    const { createDb90McpServer } = await import("../server.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDb90McpServer();
    const client = new Client({ name: "db90-mcp-test-client", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["db90_authenticate", "db90_status", "db90_sync_now"].sort());

    await client.close();
    await server.close();
  });

  it("db90_status tolerates missing credentials and returns JSON", async () => {
    const parsed = await callTool("db90_status");
    expect(parsed).toMatchObject({
      authenticated: false,
      configured: false,
      host: null,
      last_sync_at: null,
      last_result: null,
      sessions_synced: 0,
      skipped: 0,
    });
    expect(
      parsed && typeof parsed === "object" && "errors" in parsed && Array.isArray((parsed as { errors: unknown }).errors)
    ).toBe(true);
  });

  it("db90_status reports configured when credentials.json is valid", async () => {
    writeFileSync(
      join(home, "credentials.json"),
      JSON.stringify({ token: "db90_test", host: "http://localhost:3000" }),
      "utf-8"
    );

    const parsed = await callTool("db90_status");
    expect(parsed).toMatchObject({
      authenticated: true,
      configured: true,
      host: "http://localhost:3000",
      last_sync_at: null,
      last_result: null,
      sessions_synced: 0,
      skipped: 0,
      state_tracked_sessions: 0,
    });
    expect(
      parsed && typeof parsed === "object" && "errors" in parsed && Array.isArray((parsed as { errors: unknown }).errors)
    ).toBe(true);
  });

  it("db90_status tolerates malformed credentials", async () => {
    writeFileSync(join(home, "credentials.json"), "{ nope", "utf-8");

    const parsed = await callTool("db90_status");
    expect(parsed).toMatchObject({
      authenticated: false,
      configured: false,
      host: null,
      sessions_synced: 0,
      skipped: 0,
    });
  });

  it("db90_status tolerates malformed state", async () => {
    const creds = { token: "db90_test", host: "http://localhost:3000" };
    writeFileSync(join(home, "credentials.json"), JSON.stringify(creds), "utf-8");

    vi.resetModules();
    const { stateKey } = await import("../state.js");
    writeFileSync(join(home, `${stateKey(creds.host, creds.token)}.json`), "{ nope", "utf-8");

    const parsed = await callTool("db90_status");
    expect(parsed).toMatchObject({
      authenticated: true,
      configured: true,
      host: creds.host,
      state_tracked_sessions: 0,
    });
  });

  it("db90_authenticate returns device instructions without polling", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: "device-secret",
          user_code: "WXYZ-ABCD",
          verification_uri: "http://localhost:8080/device",
          verification_uri_complete: "http://localhost:8080/device?user_code=WXYZ-ABCD",
          expires_in: 300,
          interval: 5,
        }),
        { status: 200 }
      )
    );

    const parsed = await callTool("db90_authenticate", {
      keycloakUrl: "http://localhost:8080/realms/db90",
    });

    expect(parsed).toMatchObject({
      ok: true,
      verificationUri: "http://localhost:8080/device",
      verificationUriComplete: "http://localhost:8080/device?user_code=WXYZ-ABCD",
      userCode: "WXYZ-ABCD",
      expiresIn: 300,
      interval: 5,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("db90_sync_now reports ok false when another sync holds the lock", async () => {
    writeFileSync(
      join(home, "credentials.json"),
      JSON.stringify({ token: "db90_test", host: "http://localhost:3000" }),
      "utf-8"
    );

    vi.resetModules();
    const { createDb90McpServer } = await import("../server.js");
    const { acquireSyncLock } = await import("../lock.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

    const heldLock = acquireSyncLock(home);
    expect(heldLock.acquired).toBe(true);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDb90McpServer();
    const client = new Client({ name: "db90-mcp-test-client", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "db90_sync_now", arguments: {} });
    const first = result.content[0];
    if (first?.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text) as { ok: boolean; result?: { locked?: boolean } };
    expect(parsed.ok).toBe(false);
    expect(parsed.result?.locked).toBe(true);

    heldLock.release();
    await client.close();
    await server.close();
  });
});
