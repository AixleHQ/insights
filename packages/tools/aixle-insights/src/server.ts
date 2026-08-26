import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getGitRemote, resolveProjectId } from "./lib/index.js";
import { loadCredentials, type TelemetryToolId, type StoredCredentials, credentialsHaveAnyToken, pickProjectLookupToken } from "./credentials.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, startDeviceAuthorization } from "./auth/keycloak.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncTelemetryTools } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";
import { resolveCursorPricing } from "./cursor-config.js";
import { buildHealthSnapshot, healthSnapshotToStatusPayload } from "./health.js";
import { mcpLog } from "./log.js";

export const SERVER_NAME = "aixle-insights-mcp";
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

const AUTHENTICATE_INPUT_SCHEMA = z.object({
  keycloakUrl: z.string().optional(),
  clientId: z.string().optional(),
});

/** AIX-569: `db90_*` names are deprecated aliases kept for one release for existing callers. */
const DEPRECATED_ALIAS_NOTE =
  "(Deprecated — use `{name}` instead; kept temporarily for backward compatibility, see AIX-569.) ";

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

function cursorPricingForSync(): ReturnType<typeof resolveCursorPricing> {
  return resolveCursorPricing(undefined, getAppDir());
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

// Process-lifetime cache keyed on the inputs that drive resolveProjectId: host,
// lookup token, and the current repo's git remote. Re-resolve when any of them
// changes (re-auth, repo cwd change). `source: "none"` is never cached so a
// transient lookup failure doesn't poison the cache.
let cachedProjectResolution: {
  key: string;
  value: Awaited<ReturnType<typeof resolveProjectId>>;
} | null = null;

async function getProjectResolutionForSync(
  creds: StoredCredentials
): Promise<Awaited<ReturnType<typeof resolveProjectId>>> {
  const token = pickProjectLookupToken(creds);
  if (!token) return { projectId: null, source: "none" };

  const gitRemote = getGitRemote(false) ?? "no-remote";
  const cacheKey = `${creds.host}|${token}|${gitRemote}`;

  if (cachedProjectResolution?.key === cacheKey) {
    return cachedProjectResolution.value;
  }

  const result = await resolveProjectId(
    undefined,
    undefined,
    creds.host,
    token,
    false,
    creds.insecureHttpAllowed === true
  );
  mcpLog.info(
    "project_attribution_resolved",
    { project_id: result.projectId, source: result.source },
    false
  );
  if (result.source !== "none") {
    cachedProjectResolution = { key: cacheKey, value: result };
  }
  return result;
}

/** Structured status for `aixle_insights_status` — tolerates missing/malformed credentials and state. */
export async function buildAixleInsightsStatusPayload(): Promise<Record<string, unknown>> {
  const snapshot = await buildHealthSnapshot();
  return healthSnapshotToStatusPayload(snapshot);
}

async function executeSync(parsed: { tools?: TelemetryToolId[] }): Promise<unknown> {
  const creds = await loadCredentials();
  if (!creds || !credentialsHaveAnyToken(creds)) {
    mcpLog.warn("credential_validation_failed", { source: "aixle_insights_sync_now", reason: "missing_credentials" }, false);
    return { ok: false, error: "missing_credentials" };
  }
  migrateAllLegacyState(creds);
  const projectResolution = await getProjectResolutionForSync(creds);
  const result = await syncTelemetryTools({
    credentials: creds,
    dryRun: false,
    verbose: false,
    projectId: projectResolution.projectId,
    projectIdSource: projectResolution.source,
    projectLookupToken: pickProjectLookupToken(creds),
    pricing: defaultPricing(),
    cursorPricing: cursorPricingForSync(),
    tools: parsed.tools,
    scopeDir: process.cwd(),
  });
  return { ok: syncResultOk(result), result };
}

async function statusHandler() {
  return jsonContent(await buildAixleInsightsStatusPayload());
}

async function syncNowHandler(input: unknown) {
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

async function authenticateHandler(args: z.infer<typeof AUTHENTICATE_INPUT_SCHEMA>) {
  try {
    const ingestHost = process.env["DB90_API_URL"]?.trim() || "http://localhost:3000";
    const kc = (args.keycloakUrl?.trim() || defaultKeycloakIssuer(ingestHost)).trim();
    if (!kc) {
      return jsonContent({
        ok: false,
        error: "keycloakUrl or KEYCLOAK_ISSUER / AIXLE_INSIGHTS_KEYCLOAK_ISSUER is required",
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

/** In-process MCP server instance (stdio not attached). */
export function createAixleInsightsMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  const statusDescription =
    "Returns Aixle Insights MCP connectivity and last sync metadata from disk (credentials + state). No arguments.";
  server.registerTool("aixle_insights_status", { description: statusDescription }, statusHandler);
  server.registerTool(
    "db90_status",
    { description: DEPRECATED_ALIAS_NOTE.replace("{name}", "aixle_insights_status") + statusDescription },
    statusHandler
  );

  const syncNowDescription =
    "Runs one Aixle Insights ingest sync cycle for enabled tools immediately (matches background cadence). " +
      "Optional `tools` subset filter: omit to sync every tool credential you have authenticated (Claude transcripts + Cursor telemetry).";
  server.registerTool(
    "aixle_insights_sync_now",
    { description: syncNowDescription, inputSchema: SYNC_NOW_INPUT_SCHEMA },
    syncNowHandler
  );
  server.registerTool(
    "db90_sync_now",
    {
      description: DEPRECATED_ALIAS_NOTE.replace("{name}", "aixle_insights_sync_now") + syncNowDescription,
      inputSchema: SYNC_NOW_INPUT_SCHEMA,
    },
    syncNowHandler
  );

  const authenticateDescription =
    "Starts Keycloak device login and returns the visit URL/code for the user. Use aixle-insights init for the full terminal flow that saves credentials.";
  server.registerTool(
    "aixle_insights_authenticate",
    { description: authenticateDescription, inputSchema: AUTHENTICATE_INPUT_SCHEMA },
    authenticateHandler
  );
  server.registerTool(
    "db90_authenticate",
    {
      description: DEPRECATED_ALIAS_NOTE.replace("{name}", "aixle_insights_authenticate") + authenticateDescription,
      inputSchema: AUTHENTICATE_INPUT_SCHEMA,
    },
    authenticateHandler
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createAixleInsightsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let jitterTimeout: ReturnType<typeof setTimeout> | undefined;
  let shuttingDown = false;
  let activeBackground: Promise<void> = Promise.resolve();

  const onSignal = () => {
    shuttingDown = true;
    if (jitterTimeout !== undefined) clearTimeout(jitterTimeout);
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
      const projectResolution = await getProjectResolutionForSync(creds);
      await syncTelemetryTools({
        credentials: creds,
        dryRun: false,
        verbose: false,
        projectId: projectResolution.projectId,
        projectIdSource: projectResolution.source,
        projectLookupToken: pickProjectLookupToken(creds),
        pricing: defaultPricing(),
        scopeDir: process.cwd(),
        cursorPricing: cursorPricingForSync(),
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

  // Jitter the recurring interval start by up to 60 s to spread load across the install base.
  jitterTimeout = setTimeout(() => {
    if (shuttingDown) return;
    intervalId = setInterval(() => {
      activeBackground = activeBackground.finally(() => runBackground("interval"));
    }, SYNC_INTERVAL_MS);
  }, Math.floor(Math.random() * 60_000));
}
