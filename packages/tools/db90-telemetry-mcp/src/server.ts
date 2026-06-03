import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getGitRemote, resolveProjectId } from "@db90/sdk";
import { loadCredentials, type TelemetryToolId, type StoredCredentials, credentialsHaveAnyToken, pickProjectLookupToken } from "./credentials.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, startDeviceAuthorization } from "./auth/keycloak.js";
import { migrateLegacyState, getAppDir } from "./state.js";
import { syncTelemetryTools } from "./sync.js";
import { DEFAULT_PRICING, mergePricing } from "./pricing.js";
import { resolveCursorPricing } from "./cursor-config.js";
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

  const result = await resolveProjectId(undefined, undefined, creds.host, token, false);
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
