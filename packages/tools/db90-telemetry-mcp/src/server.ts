import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveProjectId } from "@db90/sdk";
import { loadCredentials, type TelemetryToolId, type StoredCredentials, credentialsHaveAnyToken } from "./credentials.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, startDeviceAuthorization } from "./auth/keycloak.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncTelemetryTools } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";
import { buildHealthSnapshot, healthSnapshotToStatusPayload } from "./health.js";
import { mcpLog } from "./log.js";

const SERVER_NAME = "db90-mcp";
const SERVER_VERSION = "0.1.0";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export const SYNC_NOW_INPUT_SCHEMA = z
  .object({
    tools: z.array(z.enum(["claude_code", "cursor"])).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tools && new Set(value.tools).size !== value.tools.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tools must not contain duplicates",
        path: ["tools"],
      });
    }
  })
  .strict();

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

function migrateAllLegacyState(creds: StoredCredentials): void {
  const appDir = getAppDir();
  const seenTokens = new Set<string>();
  for (const [_tool, tok] of Object.entries(creds.accounts)) {
    if (typeof tok === "string" && tok.length > 0 && !seenTokens.has(tok)) {
      migrateLegacyState(appDir, creds.host, tok);
      seenTokens.add(tok);
    }
  }
}

function syncResultOk(result: Awaited<ReturnType<typeof syncTelemetryTools>>): boolean {
  return !result.locked && result.failed === 0;
}

// Process-lifetime cache for the resolved project_id. The MCP server runs for
// hours/days, so we resolve once and reuse — but only when the result is
// definitive. `source: "none"` covers both "no git remote" (won't change
// in-process) and "lookup network error" (transient); re-resolving costs
// milliseconds when there's no remote, so we always retry on `none` rather
// than poison the cache with a transient failure.
let cachedProjectId: { value: string | null } | null = null;

async function getProjectIdForSync(creds: StoredCredentials): Promise<string | null> {
  if (cachedProjectId) return cachedProjectId.value;
  // Both tools' ingest tokens auth the same org in current product flows; the
  // lookup endpoint is org-scoped, so either works. If a user ever authenticates
  // the two tools to different orgs, attribution would silently follow whichever
  // token wins object iteration order — flag for follow-up if that becomes real.
  const token = Object.values(creds.accounts).find((t): t is string => typeof t === "string" && t.length > 0);
  if (!token) return null;
  const result = await resolveProjectId(undefined, undefined, creds.host, token, false);
  mcpLog.info(
    "project_attribution_resolved",
    { project_id: result.projectId, source: result.source },
    false
  );
  if (result.source !== "none") {
    cachedProjectId = { value: result.projectId };
  }
  return result.projectId;
}

/** Structured status for `db90_status` — tolerates missing/malformed credentials and state. */
export async function buildDb90StatusPayload(): Promise<Record<string, unknown>> {
  const snapshot = await buildHealthSnapshot();
  return healthSnapshotToStatusPayload(snapshot);
}

async function executeSync(parsed: { tools?: TelemetryToolId[] }): Promise<unknown> {
  const creds = await loadCredentials();
  if (!creds || !credentialsHaveAnyToken(creds)) {
    mcpLog.warn("credential_validation_failed", { source: "db90_sync_now", reason: "missing_credentials" }, false);
    return { ok: false, error: "missing_credentials" };
  }
  migrateAllLegacyState(creds);
  const result = await syncTelemetryTools({
    credentials: creds,
    dryRun: false,
    verbose: false,
    projectId: await getProjectIdForSync(creds),
    pricing: defaultPricing(),
    tools: parsed.tools,
  });
  return { ok: syncResultOk(result), result };
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
        "Runs one DB90 ingest sync cycle for enabled tools immediately (matches background cadence). " +
          "Optional `tools` subset filter: omit to sync every tool credential you have authenticated (Claude transcripts + Cursor telemetry).",
      inputSchema: SYNC_NOW_INPUT_SCHEMA,
    },
    async (input: unknown) => {
      try {
        const parsed = SYNC_NOW_INPUT_SCHEMA.parse(input ?? {});
        return jsonContent(await executeSync(parsed));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return jsonContent({
            ok: false,
            error: "validation_error",
            details: err.flatten(),
          });
        }
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
    if (!creds || !credentialsHaveAnyToken(creds)) {
      mcpLog.warn("credential_validation_failed", { source, reason: "missing_credentials" }, false);
      return;
    }
    try {
      migrateAllLegacyState(creds);
      await syncTelemetryTools({
        credentials: creds,
        dryRun: false,
        verbose: false,
        projectId: await getProjectIdForSync(creds),
        pricing: defaultPricing(),
      });
    } catch (err) {
      mcpLog.error(
        "background_sync_failed",
        { source, error: err instanceof Error ? err.message : String(err) },
        true
      );
    }
  };

  activeBackground = runBackground("startup");

  intervalId = setInterval(() => {
    activeBackground = activeBackground.finally(() => runBackground("interval"));
  }, SYNC_INTERVAL_MS);
}
