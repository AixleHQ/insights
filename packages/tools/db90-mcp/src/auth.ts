import { saveCredentials, loadCredentials, clearCredentials } from "./keychain.js";
import { loadConfig, type Config } from "./config.js";
import { recordError } from "./log.js";

export interface AuthStatus {
  authenticated: boolean;
  host: string | null;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const creds = await loadCredentials();
  return {
    authenticated: creds !== null,
    host: creds?.host ?? null,
  };
}

export async function logout(): Promise<void> {
  await clearCredentials();
}

export async function setCredentialsForTesting(ingestToken: string, host: string): Promise<void> {
  await saveCredentials(ingestToken, host);
}

export interface DeviceFlowStart {
  verificationUri: string;
  verificationUriComplete: string | null;
  userCode: string;
  deviceCode: string;
  expiresInMs: number;
  intervalMs: number;
}

export interface AuthenticateOptions {
  toolName?: "claude_code" | "cursor";
  config?: Config;
  // Called with the device-flow prompt as soon as it's available so the MCP
  // can surface verification_uri + user_code to the editor user.
  onPrompt?: (start: DeviceFlowStart) => void;
}

interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface OidcDiscovery {
  device_authorization_endpoint: string;
  token_endpoint: string;
}

const POLL_INTERVAL_FALLBACK_SECONDS = 5;

async function discover(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} at ${url}`);
  const json = (await res.json()) as Partial<OidcDiscovery>;
  if (!json.device_authorization_endpoint || !json.token_endpoint) {
    throw new Error("OIDC discovery missing device_authorization_endpoint or token_endpoint");
  }
  return json as OidcDiscovery;
}

async function startDeviceFlow(
  endpoint: string,
  clientId: string
): Promise<DeviceAuthResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scope: "openid email profile" }),
  });
  if (!res.ok) {
    throw new Error(`Device authorization request failed: ${res.status}`);
  }
  return (await res.json()) as DeviceAuthResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForToken(
  tokenEndpoint: string,
  clientId: string,
  deviceCode: string,
  intervalMs: number,
  expiresAt: number
): Promise<string> {
  let currentInterval = intervalMs;
  while (Date.now() < expiresAt) {
    await sleep(currentInterval);
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: clientId,
      }),
    });
    const body = (await res.json()) as TokenResponse;
    if (res.ok && body.access_token) return body.access_token;
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      currentInterval += 5_000;
      continue;
    }
    if (body.error === "access_denied") throw new Error("Login was denied");
    if (body.error === "expired_token") throw new Error("Login flow expired before completion");
    throw new Error(`Token endpoint error: ${body.error ?? "unknown"} ${body.error_description ?? ""}`);
  }
  throw new Error("Login flow timed out");
}

async function exchangeForIngestToken(
  host: string,
  oidcToken: string,
  toolName: "claude_code" | "cursor"
): Promise<{ ingestToken: string; host: string }> {
  const res = await fetch(`${host.replace(/\/$/, "")}/api/v1/integrations/mcp/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${oidcToken}`,
    },
    body: JSON.stringify({ tool_name: toolName }),
  });
  if (!res.ok) {
    throw new Error(`Exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ingest_token?: string; host?: string };
  if (!body.ingest_token || !body.host) {
    throw new Error("Exchange response missing ingest_token or host");
  }
  return { ingestToken: body.ingest_token, host: body.host };
}

export async function authenticate(options: AuthenticateOptions = {}): Promise<{
  host: string;
}> {
  const config = options.config ?? loadConfig();
  const toolName = options.toolName ?? config.defaultToolName;
  const clientId = process.env["DB90_MCP_CLIENT_ID"] ?? "db90-mcp";

  try {
    const discovery = await discover(config.keycloakIssuer);
    const startResp = await startDeviceFlow(discovery.device_authorization_endpoint, clientId);

    const intervalMs = (startResp.interval ?? POLL_INTERVAL_FALLBACK_SECONDS) * 1_000;
    const expiresAt = Date.now() + startResp.expires_in * 1_000;
    const start: DeviceFlowStart = {
      verificationUri: startResp.verification_uri,
      verificationUriComplete: startResp.verification_uri_complete ?? null,
      userCode: startResp.user_code,
      deviceCode: startResp.device_code,
      expiresInMs: startResp.expires_in * 1_000,
      intervalMs,
    };
    options.onPrompt?.(start);

    const oidcToken = await pollForToken(
      discovery.token_endpoint,
      clientId,
      start.deviceCode,
      intervalMs,
      expiresAt
    );

    const { ingestToken, host } = await exchangeForIngestToken(config.host, oidcToken, toolName);
    await saveCredentials(ingestToken, host);
    return { host };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordError(`authenticate: ${msg}`);
    throw err;
  }
}
