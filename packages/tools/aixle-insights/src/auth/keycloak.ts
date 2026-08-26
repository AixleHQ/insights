/**
 * RFC 8628 OAuth 2.0 Device Authorization Grant against Keycloak OIDC endpoints.
 */

import { createHash, randomBytes } from "node:crypto";
import { isLoopbackHost } from "../lib/transport-security.js";
import { readEnvWithDeprecatedAlias, readBooleanEnvWithDeprecatedAlias, warnDeprecatedEnvVar } from "../lib/env.js";

export interface DeviceAuthorizationStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
  code_verifier?: string;
}

function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/$/, "");
}

function formEncode(body: Record<string, string>): string {
  return new URLSearchParams(body).toString();
}

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkceVerifier(): string {
  return base64Url(randomBytes(32));
}

function pkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export async function startDeviceAuthorization(params: {
  issuer: string;
  clientId: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}): Promise<DeviceAuthorizationStart> {
  const fetchFn = params.fetchImpl ?? fetch;
  const issuer = normalizeIssuer(params.issuer);
  const url = `${issuer}/protocol/openid-connect/auth/device`;
  const scope = params.scope ?? "openid profile email";
  const codeVerifier = generatePkceVerifier();
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({
      client_id: params.clientId,
      scope,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
    }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Keycloak device auth: expected JSON, got HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = json as Record<string, unknown>;
    const desc = typeof err["error_description"] === "string" ? err["error_description"] : text;
    throw new Error(`Keycloak device auth failed (${res.status}): ${desc}`);
  }
  const o = json as Record<string, unknown>;
  const device_code = o["device_code"];
  const user_code = o["user_code"];
  const verification_uri = o["verification_uri"];
  const expires_in = o["expires_in"];
  if (
    typeof device_code !== "string" ||
    typeof user_code !== "string" ||
    typeof verification_uri !== "string" ||
    typeof expires_in !== "number"
  ) {
    throw new Error("Keycloak device auth: malformed response (missing device_code, user_code, verification_uri, or expires_in)");
  }
  const interval = typeof o["interval"] === "number" ? o["interval"] : 5;
  return {
    device_code,
    user_code,
    verification_uri,
    verification_uri_complete: typeof o["verification_uri_complete"] === "string" ? o["verification_uri_complete"] : undefined,
    expires_in,
    interval,
    code_verifier: codeVerifier,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollDeviceAccessToken(params: {
  issuer: string;
  clientId: string;
  deviceAuthorization: DeviceAuthorizationStart;
  /** Called once before polling so UIs can show the visit URL and user code. */
  onInstructions?: (verification_uri: string, user_code: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = params.fetchImpl ?? fetch;
  const issuer = normalizeIssuer(params.issuer);
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  const { deviceAuthorization: d } = params;
  let intervalSec = Math.max(1, d.interval ?? 5);
  const deadline = Date.now() + d.expires_in * 1000;
  let lastTransientError: string | null = null;

  params.onInstructions?.(d.verification_uri, d.user_code);

  // RFC 8628: wait at least `interval` before the first token request.
  await sleep(intervalSec * 1000);

  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetchFn(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formEncode({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: d.device_code,
          client_id: params.clientId,
          ...(d.code_verifier ? { code_verifier: d.code_verifier } : {}),
        }),
      });
    } catch (e) {
      lastTransientError = e instanceof Error ? e.message : String(e);
      await sleep(intervalSec * 1000);
      continue;
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      lastTransientError = `invalid JSON from token endpoint (HTTP ${res.status}): ${text.slice(0, 200)}`;
      await sleep(intervalSec * 1000);
      continue;
    }

    const o = json as Record<string, unknown>;
    const err = o["error"];

    if (res.ok && typeof o["access_token"] === "string") {
      return o["access_token"];
    }

    if (err === "authorization_pending") {
      await sleep(intervalSec * 1000);
      continue;
    }
    if (err === "slow_down") {
      intervalSec += 5;
      await sleep(intervalSec * 1000);
      continue;
    }
    if (err === "access_denied") {
      throw new Error("Keycloak device flow: access_denied");
    }
    if (err === "expired_token") {
      throw new Error("Keycloak device flow: expired_token");
    }

    const desc = typeof o["error_description"] === "string" ? o["error_description"] : text;
    throw new Error(`Keycloak token endpoint error: ${String(err)} — ${desc}`);
  }

  if (lastTransientError) {
    throw new Error(`Keycloak device flow: timed out waiting for authorization; last polling error: ${lastTransientError}`);
  }
  throw new Error("Keycloak device flow: timed out waiting for authorization");
}

export async function obtainKeycloakAccessTokenViaDeviceFlow(params: {
  issuer: string;
  clientId: string;
  scope?: string;
  onInstructions?: (verification_uri: string, user_code: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const start = await startDeviceAuthorization({
    issuer: params.issuer,
    clientId: params.clientId,
    scope: params.scope,
    fetchImpl: params.fetchImpl,
  });
  return pollDeviceAccessToken({
    issuer: params.issuer,
    clientId: params.clientId,
    deviceAuthorization: start,
    onInstructions: params.onInstructions,
    fetchImpl: params.fetchImpl,
  });
}

export function defaultKeycloakIssuer(ingestHost?: string): string {
  const fromEnv =
    readEnvWithDeprecatedAlias({
      current: "AIXLE_INSIGHTS_KEYCLOAK_ISSUER",
      deprecated: "DB90_KEYCLOAK_ISSUER",
      onDeprecatedUse: warnDeprecatedEnvVar,
    }) || process.env["KEYCLOAK_ISSUER"]?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const useLocalDefault = readBooleanEnvWithDeprecatedAlias({
    current: "AIXLE_INSIGHTS_MCP_USE_LOCAL_KEYCLOAK_DEFAULT",
    deprecated: "DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT",
    onDeprecatedUse: warnDeprecatedEnvVar,
  });
  if (useLocalDefault || process.env["NODE_ENV"] === "development") {
    if (ingestHost) {
      let hostname: string;
      try {
        hostname = new URL(ingestHost).hostname;
      } catch {
        hostname = ingestHost;
      }
      if (!isLoopbackHost(hostname)) {
        const reason = useLocalDefault
          ? `DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT=${process.env["DB90_MCP_USE_LOCAL_KEYCLOAK_DEFAULT"]}`
          : `NODE_ENV=development`;
        console.error(
          `[aixle-insights] Warning: ${reason} would redirect Keycloak authentication to ` +
          `http://localhost:8080, but the ingest host "${ingestHost}" is not localhost. ` +
          `Ignoring the local Keycloak default. Set DB90_KEYCLOAK_ISSUER explicitly.`
        );
        return "";
      }
    }
    return "http://localhost:8080/realms/db90";
  }
  return "";
}

export function defaultKeycloakClientId(): string {
  return (
    readEnvWithDeprecatedAlias({
      current: "AIXLE_INSIGHTS_KEYCLOAK_CLIENT_ID",
      deprecated: "DB90_KEYCLOAK_CLIENT_ID",
      onDeprecatedUse: warnDeprecatedEnvVar,
    }) || "db90-web"
  );
}
