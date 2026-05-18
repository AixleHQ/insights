import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadCredentials } from "./credentials.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, startDeviceAuthorization } from "./auth/keycloak.js";
import { readState, migrateLegacyState, getAppDir } from "./state.js";
import { syncOnce, getSyncTelemetry } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";

const SERVER_NAME = "db90-mcp";
const SERVER_VERSION = "0.1.0";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

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

function defaultPricing(): ReturnType<typeof mergePricing> {
  return mergePricing(DEFAULT_PRICING, {});
}

function syncResultOk(result: Awaited<ReturnType<typeof syncOnce>>): boolean {
  return !result.locked && result.failed === 0;
}

/** Structured status for `db90_status` — tolerates missing/malformed credentials and state. */
export async function buildDb90StatusPayload(): Promise<Record<string, unknown>> {
  const telemetry = getSyncTelemetry();
  try {
    const creds = await loadCredentials();
    if (!creds) {
      return {
        authenticated: false,
        configured: false,
        host: null,
        last_sync_at: telemetry.lastSyncAt,
        last_result: telemetry.lastResult,
        sessions_synced: telemetry.lastResult?.sent ?? 0,
        skipped: telemetry.lastResult?.skipped ?? 0,
        errors: telemetry.recentErrors,
      };
    }
    const appDir = getAppDir();
    const state = readState(appDir, creds.host, creds.token);
    return {
      authenticated: true,
      configured: true,
      host: creds.host,
      last_sync_at: telemetry.lastSyncAt,
      last_result: telemetry.lastResult,
      sessions_synced: telemetry.lastResult?.sent ?? 0,
      skipped: telemetry.lastResult?.skipped ?? 0,
      state_tracked_sessions: Object.keys(state.sessions).length,
      errors: telemetry.recentErrors,
    };
  } catch (err) {
    return {
      authenticated: false,
      configured: false,
      host: null,
      last_sync_at: telemetry.lastSyncAt,
      last_result: telemetry.lastResult,
      sessions_synced: 0,
      skipped: 0,
      errors: [...telemetry.recentErrors, err instanceof Error ? err.message : String(err)],
    };
  }
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
        "Returns DB90 MCP connectivity and last sync metadata from disk (credentials + state). No arguments.",
    },
    async () => jsonContent(await buildDb90StatusPayload())
  );

  server.registerTool(
    "db90_sync_now",
    {
      description:
        "Runs one Claude transcript → DB90 ingest sync cycle immediately (same path as the background timer). No arguments.",
    },
    async () => {
      try {
        const creds = await loadCredentials();
        if (!creds) {
          return jsonContent({ ok: false, error: "missing_credentials" });
        }
        migrateLegacyState(getAppDir(), creds.host, creds.token);
        const result = await syncOnce({
          token: creds.token,
          host: creds.host,
          dryRun: false,
          verbose: false,
          projectId: null,
          pricing: defaultPricing(),
        });
        return jsonContent({ ok: syncResultOk(result), result });
      } catch (err) {
        return jsonContent({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  server.registerTool(
    "db90_authenticate",
    {
      description:
        "Starts Keycloak device login and returns the visit URL/code for the user. Use db90-mcp init for the full terminal flow that saves credentials.",
      inputSchema: z.object({
        keycloakUrl: z.string().optional(),
        clientId: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        const args = input;
        const kc = (args.keycloakUrl?.trim() || defaultKeycloakIssuer()).trim();
        if (!kc) {
          return jsonContent({
            ok: false,
            error: "keycloakUrl or KEYCLOAK_ISSUER / DB90_KEYCLOAK_ISSUER is required",
          });
        }
        const clientId = args.clientId?.trim() || defaultKeycloakClientId();
        const device = await startDeviceAuthorization({
          issuer: kc,
          clientId,
        });
        return jsonContent({
          ok: true,
          verificationUri: device.verification_uri,
          verificationUriComplete: device.verification_uri_complete ?? null,
          userCode: device.user_code,
          expiresIn: device.expires_in,
          interval: device.interval ?? 5,
          issuer: kc,
          clientId,
          message: `Visit ${device.verification_uri} and enter code ${device.user_code}`,
        });
      } catch (err) {
        return jsonContent({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createDb90McpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let shuttingDown = false;
  let activeBackground: Promise<void> = Promise.resolve();

  const onSignal = () => {
    shuttingDown = true;
    if (intervalId !== undefined) clearInterval(intervalId);
    activeBackground.finally(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const runBackground = async (source: string) => {
    if (shuttingDown) return;
    const creds = await loadCredentials();
    if (!creds) return;
    try {
      migrateLegacyState(getAppDir(), creds.host, creds.token);
      await syncOnce({
        token: creds.token,
        host: creds.host,
        dryRun: false,
        verbose: false,
        projectId: null,
        pricing: defaultPricing(),
      });
    } catch (err) {
      console.error(`[db90-mcp] sync (${source}) failed:`, err instanceof Error ? err.message : err);
    }
  };

  activeBackground = runBackground("startup");

  intervalId = setInterval(() => {
    activeBackground = activeBackground.finally(() => runBackground("interval"));
  }, SYNC_INTERVAL_MS);
}
