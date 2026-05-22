import { exchangeIngestToken, type ExchangeResult } from "./exchange.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, obtainKeycloakAccessTokenViaDeviceFlow } from "./keycloak.js";
import { loadCredentials, saveStoredCredentials } from "./credentials.js";
import type { TelemetryToolId, StoredCredentials } from "./credentials.js";
import { getAppDir } from "../state.js";

export interface LoginAndPersistOptions {
  db90Host: string;
  keycloakIssuer: string;
  /** @deprecated Prefer `tools`; kept for callers that mint a single ingest account. */
  toolName?: string;
  tools?: TelemetryToolId[];
  deviceLabel?: string;
  clientId?: string;
  appDir?: string;
  onVisitInstructions?: (verification_uri: string, user_code: string) => void;
  fetchImpl?: typeof fetch;
}

export async function loginAndPersistCredentials(opts: LoginAndPersistOptions): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; error: string }
> {
  const issuer = opts.keycloakIssuer.trim();
  if (!issuer) {
    return { ok: false, error: "Keycloak issuer is empty; set KEYCLOAK_ISSUER or pass --keycloak-url." };
  }
  const clientId = opts.clientId?.trim() || defaultKeycloakClientId();
  const appDir = opts.appDir ?? getAppDir();

  const requestedTools: TelemetryToolId[] =
    opts.tools ??
    ((opts.toolName ?? "claude_code") === "cursor" ? (["cursor"] as const) : (["claude_code"] as const));

  let accessToken: string;
  try {
    accessToken = await obtainKeycloakAccessTokenViaDeviceFlow({
      issuer,
      clientId,
      onInstructions: opts.onVisitInstructions,
      fetchImpl: opts.fetchImpl,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let exchanged: ExchangeResult;
  try {
    if (requestedTools.length > 1) {
      exchanged = await exchangeIngestToken({
        db90Host: opts.db90Host,
        keycloakAccessToken: accessToken,
        tools: requestedTools,
        deviceLabel: opts.deviceLabel,
        fetchImpl: opts.fetchImpl,
      });
    } else {
      exchanged = await exchangeIngestToken({
        db90Host: opts.db90Host,
        keycloakAccessToken: accessToken,
        toolName: requestedTools[0],
        deviceLabel: opts.deviceLabel,
        fetchImpl: opts.fetchImpl,
      });
    }

    const existing = await loadCredentials(appDir);
    const stored: StoredCredentials = {
      host: exchanged.ingestHost,
      organizationId: exchanged.organizationId,
      accounts: existing?.host === exchanged.ingestHost ? { ...existing.accounts } : {},
    };
    for (const tid of ["claude_code", "cursor"] as const) {
      const acc = exchanged.accounts[tid];
      if (acc?.ingestToken) stored.accounts[tid] = acc.ingestToken;
    }

    await saveStoredCredentials(stored, appDir);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, organizationId: exchanged.organizationId };
}

export { defaultKeycloakIssuer, defaultKeycloakClientId };
