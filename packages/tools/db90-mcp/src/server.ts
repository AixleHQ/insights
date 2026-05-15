import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const SERVER_NAME = "db90-mcp";
const SERVER_VERSION = "0.1.0";

/** Phase-0 contract — must match story AC #4 exactly. */
export const PLACEHOLDER_STATUS = {
  authenticated: false,
  host: null,
  last_sync_at: null,
  sessions_synced: 0,
  errors: [],
} as const;

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/** In-process MCP server instance (stdio not attached). */
export function createDb90McpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    "db90_status",
    {
      description:
        "Phase-0 placeholder: returns static connectivity metadata. No arguments; no network or auth.",
    },
    async () => jsonContent({ ...PLACEHOLDER_STATUS })
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createDb90McpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
