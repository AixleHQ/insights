// Stdio MCP server: tools + resources surface (Task 09) + 5-min syncAll
// watcher (Task 08). Tool callable surface mirrors plan/tasks/09-mcp-tools.md.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { syncAll } from "./sync.js";
import { authenticate, getAuthStatus } from "./auth.js";
import { loadState } from "./state.js";
import { loadConfig } from "./config.js";
import { recentErrors, log, recordError } from "./log.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SERVER_NAME = "db90-mcp";
const SERVER_VERSION = "0.1.0";

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const summary = await syncAll();
    log(
      "info",
      `sync tick: sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped} errors=${summary.errors.length}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordError(`sync tick crashed: ${message}`);
  }
}

async function buildStatusPayload(): Promise<{
  authenticated: boolean;
  host: string | null;
  last_sync_at: string | null;
  errors_count: number;
  recent_errors: { at: string; message: string }[];
}> {
  const auth = await getAuthStatus();
  const state = loadState();
  return {
    authenticated: auth.authenticated,
    host: auth.host,
    last_sync_at: state.lastSyncAt,
    errors_count: state.errorsCount,
    recent_errors: recentErrors(),
  };
}

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

function registerTools(server: McpServer): void {
  server.registerTool(
    "db90_status",
    {
      description:
        "Returns the MCP's current authentication, last-sync, and error state. No arguments. Safe to call when ingest is broken.",
    },
    async () => jsonContent(await buildStatusPayload())
  );

  server.registerTool(
    "db90_authenticate",
    {
      description:
        "Starts the Keycloak device flow. Returns the verification URL and user code so the user can complete login in their browser. No arguments.",
    },
    async () => {
      let prompt: { verification_uri: string; user_code: string; expires_in_ms: number } | null = null;
      // Run authenticate() in the background; surface the prompt as soon as
      // it's available so the model can show it to the user. The eventual
      // outcome (success/failure) lands in the next db90_status() call.
      const promise = authenticate({
        onPrompt: (p) => {
          prompt = {
            verification_uri: p.verificationUriComplete ?? p.verificationUri,
            user_code: p.userCode,
            expires_in_ms: p.expiresInMs,
          };
        },
      });
      promise.catch((err) => {
        recordError(`db90_authenticate: ${err instanceof Error ? err.message : String(err)}`);
      });
      // Wait briefly for the prompt to land. The device-authorization
      // request is fast (sub-second), but we cap at 5s so an unhealthy
      // realm doesn't hang the editor.
      const startedAt = Date.now();
      while (!prompt && Date.now() - startedAt < 5_000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!prompt) {
        return jsonContent({
          error:
            "Could not start the login flow. Check ~/.db90-mcp/config.json (keycloakIssuer) and your network.",
        });
      }
      return jsonContent(prompt);
    }
  );

  server.registerTool(
    "db90_sync_now",
    {
      description:
        "Runs one sync pass on demand. Background watcher continues to run on its 5-minute schedule.",
      inputSchema: {
        dry_run: z
          .boolean()
          .optional()
          .describe("Reserved for future use; ignored in 0.1.0"),
      },
    },
    async () => jsonContent(await syncAll())
  );

  server.registerTool(
    "db90_open_dashboard",
    {
      description:
        "Returns the URL of the user's db90 dashboard so the user can review synced events.",
    },
    async () => {
      const auth = await getAuthStatus();
      const config = loadConfig();
      const host = auth.host ?? config.host;
      return jsonContent({ url: `${host.replace(/\/$/, "")}/dashboard` });
    }
  );
}

function registerResources(server: McpServer): void {
  server.registerResource(
    "db90-status",
    "db90://status",
    { description: "Current MCP authentication, last-sync, and error state.", mimeType: "application/json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(await buildStatusPayload(), null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "db90-recent-sessions",
    "db90://recent-sessions",
    {
      description:
        "Last 20 sync errors from the in-memory ring buffer. Per-session checkpoint detail lives in ~/.db90-claude/ and is not exposed over the MCP.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(recentErrors().slice(-20), null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "db90-config",
    "db90://config",
    { description: "Non-secret MCP configuration (host, default tool, sync interval).", mimeType: "application/json" },
    async (uri) => {
      const config = loadConfig();
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                host: config.host,
                keycloak_issuer: config.keycloakIssuer,
                default_tool_name: config.defaultToolName,
                sync_interval_ms: SYNC_INTERVAL_MS,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

export async function startServer(): Promise<void> {
  log("info", "MCP server starting");

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );

  registerTools(server);
  registerResources(server);

  void tick();
  timer = setInterval(() => {
    void tick();
  }, SYNC_INTERVAL_MS);

  const stop = (signal: string) => {
    if (timer) clearInterval(timer);
    log("info", `MCP server stopped (${signal})`);
    server.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
