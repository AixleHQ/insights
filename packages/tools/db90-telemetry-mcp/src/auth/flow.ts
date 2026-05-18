import { exchangeIngestToken, type ExchangeResult } from "./exchange.js";
import { defaultKeycloakClientId, defaultKeycloakIssuer, obtainKeycloakAccessTokenViaDeviceFlow } from "./keycloak.js";
import { saveCredentials } from "./credentials.js";
import { getAppDir } from "../state.js";

export interface LoginAndPersistOptions {
  db90Host: string;
  keycloakIssuer: string;
  toolName: string;
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
    exchanged = await exchangeIngestToken({
      db90Host: opts.db90Host,
      keycloakAccessToken: accessToken,
      toolName: opts.toolName,
      deviceLabel: opts.deviceLabel,
      fetchImpl: opts.fetchImpl,
    });
    await saveCredentials(exchanged.ingestToken, exchanged.ingestHost, appDir);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, organizationId: exchanged.organizationId };
}

export { defaultKeycloakIssuer, defaultKeycloakClientId };
