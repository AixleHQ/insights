import Rollbar from "rollbar";
import { ErrorResponse } from "oidc-client-ts";
import { config } from "./config";

export const rollbarConfig: Rollbar.Configuration = {
  accessToken: config.rollbarClientToken,
  enabled: !!config.rollbarClientToken,
  environment: import.meta.env.MODE,
  captureUncaught: true,
  captureUnhandledRejections: true,
};

/**
 * Shared Rollbar instance. Passed to <RollbarProvider instance={rollbar}> in main.tsx
 * so React error boundaries and imperative reporters (auth.ts, the auth callbacks) all
 * report through the same client.
 */
export const rollbar = new Rollbar(rollbarConfig);

export interface AuthErrorContext {
  /** Which auth surface reported this, e.g. "AuthCallback", "silentRenew". */
  surface: string;
  [key: string]: unknown;
}

/**
 * Report an auth/OIDC failure to Rollbar with structured context.
 *
 * Every auth failure in this app is caught locally (silent-renew catch blocks, the
 * callback pages), so Rollbar's automatic uncaught-exception capture never sees them —
 * this is the only path that makes them visible. The OIDC error code + description are
 * pulled out as top-level custom fields so an incident can be correlated with Keycloak's
 * server-side Events log without an ad-hoc admin-console dig.
 */
export function reportAuthError(error: unknown, context: AuthErrorContext): void {
  const oidc = error instanceof ErrorResponse ? error : undefined;
  const custom = {
    ...context,
    oidcError: oidc?.error ?? null,
    oidcErrorDescription: oidc?.error_description ?? null,
    reportedAt: new Date().toISOString(),
  };
  const message = `[auth] ${context.surface}${oidc?.error ? `: ${oidc.error}` : ""}`;

  if (error instanceof Error) {
    rollbar.error(message, error, custom);
  } else {
    rollbar.error(message, custom);
  }
}
