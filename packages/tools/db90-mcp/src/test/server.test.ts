import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDb90McpServer, PLACEHOLDER_STATUS } from "../server.js";

describe("MCP server (in-process)", () => {
  it("round-trips tools/call for db90_status with the phase-0 placeholder JSON", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDb90McpServer();
    const client = new Client({ name: "db90-mcp-test-client", version: "0.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["db90_status"]);

    const result = await client.callTool({ name: "db90_status", arguments: {} });
    expect(result.content).toHaveLength(1);
    const first = result.content[0];
    expect(first?.type).toBe("text");
    if (first?.type !== "text") throw new Error("expected text content");
    const parsed: unknown = JSON.parse(first.text);
    expect(parsed).toEqual(PLACEHOLDER_STATUS);

    await client.close();
    await server.close();
  });
});
