import { UserManager, User, Log, ErrorResponse } from "oidc-client-ts";
import type { UserManagerSettings } from "oidc-client-ts";
import { config } from "./config";
import { reportAuthError } from "./rollbar";
import { ORG_STORAGE_KEY } from "../contexts/OrgContext";

if (import.meta.env.DEV) {
  Log.setLogger(console);
  Log.setLevel(Log.INFO);
}

const keycloakConfig = {
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClientId,
};

// OIDC User Manager settings
const settings: UserManagerSettings = {
  authority: `${keycloakConfig.url}/realms/${keycloakConfig.realm}`,
  client_id: keycloakConfig.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  // silent_redirect_uri must point to a page that calls signinSilentCallback().
  // Without this, oidc-client-ts falls back to redirect_uri (/auth/callback)
  // which cannot handle the silent renew postMessage — causing IFrame timeouts.
  silent_redirect_uri: `${window.location.origin}/auth/silent-callback`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  silentRequestTimeoutInSeconds: 10,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  filterProtocolClaims: true,
  loadUserInfo: true,
  monitorSession: true,
};

// Create singleton UserManager instance
let userManager: UserManager | null = null;

/** Deduplicate concurrent signinRedirectCallback (React Strict Mode dev, rare races). */
let signinRedirectCallbackInFlight: Promise<User> | null = null;

/** Deduplicate concurrent signinSilent calls (React Strict Mode double-mount, parallel hooks). */
let signinSilentInFlight: Promise<User | null> | null = null;

/**
 * True when an OIDC error means the session/refresh token or authorization code is
 * genuinely dead and a fresh login is required — Keycloak returns `invalid_grant` for
 * both "Token is not active" (dead refresh token on silent renew) and "Code not valid"
 * (dead authorization code on the exchange). Network/timeout failures are NOT
 * `ErrorResponse`s (they surface as `TypeError`/`ErrorTimeout`), so they return false
 * and stay tolerated rather than forcing a logout.
 */
export function isDeadSessionError(error: unknown): boolean {
  const isErrorResponse =
    error instanceof ErrorResponse ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "ErrorResponse");
  return isErrorResponse && (error as ErrorResponse).error === "invalid_grant";
}

export function getUserManager(): UserManager {
  if (!userManager) {
    userManager = new UserManager(settings);

    // Set up event handlers
    userManager.events.addAccessTokenExpiring(() => {
      console.log("[Auth] Access token expiring...");
    });

    userManager.events.addAccessTokenExpired(() => {
      console.log("[Auth] Access token expired");
    });

    userManager.events.addSilentRenewError((error) => {
      console.error("[Auth] Silent renew error:", error);
    });

    userManager.events.addUserLoaded((user) => {
      console.log("[Auth] User loaded:", user.profile.email);
    });

    userManager.events.addUserUnloaded(() => {
      console.log("[Auth] User unloaded");
    });

    userManager.events.addUserSignedOut(() => {
      console.log("[Auth] User signed out");
    });
  }

  return userManager;
}

// Auth helper functions
export async function login(returnUrl?: string): Promise<void> {
  const manager = getUserManager();
  // kc_idp_hint must match the IDP alias in Keycloak Admin → Identity Providers
  // returnUrl round-trips through the OIDC `state` param so AuthCallback can
  // restore the page the user was trying to reach (e.g. an invitation link)
  // after the Keycloak redirect — React Router's own location.state cannot
  // survive that external round-trip.
  await manager.signinRedirect({
    extraQueryParams: { kc_idp_hint: "google-dbp" },
    state: returnUrl,
  });
}

export async function loginCallback(): Promise<User> {
  const manager = getUserManager();
  if (signinRedirectCallbackInFlight) {
    return signinRedirectCallbackInFlight;
  }
  signinRedirectCallbackInFlight = manager.signinRedirectCallback().finally(() => {
    signinRedirectCallbackInFlight = null;
  });
  return signinRedirectCallbackInFlight;
}

export async function logout(): Promise<void> {
  // Clear the stored org so the default_org_id preference wins on the next login
  // instead of the last-used org from this session (AIX-318).
  localStorage.removeItem(ORG_STORAGE_KEY);
  const manager = getUserManager();
  await manager.signoutRedirect();
}

export async function getUser(): Promise<User | null> {
  const manager = getUserManager();
  return manager.getUser();
}

export async function getAccessToken(): Promise<string | null> {
  const manager = getUserManager();
  let user = await manager.getUser();

  // If no user or token is expired/expiring soon, try silent renew
  if (user) {
    // Check if token expires within 30 seconds
    const expiresAt = user.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = expiresAt - now;

    if (user.expired || expiresIn < 30) {
      console.log("[Auth] Token expired or expiring soon, attempting silent renew...");
      try {
        user = await manager.signinSilent();
      } catch (error) {
        console.error("[Auth] Silent renew failed in getAccessToken:", error);
        reportAuthError(error, { surface: "getAccessToken" });
        // On a genuinely dead session, do NOT hand back the stale token — return null so
        // callers (api.ts, AuthContext) treat this as unauthenticated instead of looping
        // on 401s with a token Keycloak will never accept again.
        if (isDeadSessionError(error)) {
          return null;
        }
        // Transient error (network/timeout): fall through and return the existing token,
        // which may still be valid for its remaining lifetime.
      }
    }
  }

  return user?.access_token ?? null;
}

export async function silentRenew(): Promise<User | null> {
  if (signinSilentInFlight) {
    return signinSilentInFlight;
  }
  const manager = getUserManager();
  signinSilentInFlight = manager.signinSilent().catch((error) => {
    console.error("[Auth] Silent renew failed:", error);
    reportAuthError(error, { surface: "silentRenew" });
    return null;
  }).finally(() => {
    signinSilentInFlight = null;
  });
  return signinSilentInFlight;
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getUser();
  return !!user && !user.expired;
}

// User profile type
export interface UserProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export function getUserProfile(user: User): UserProfile {
  return {
    sub: user.profile.sub,
    email: user.profile.email ?? "",
    name: user.profile.name,
    picture: user.profile.picture,
    email_verified: user.profile.email_verified,
  };
}

// API client helper - adds auth header to fetch requests
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Direct login with username and password (Resource Owner Password Grant)
 * Note: Requires Keycloak client to have "Direct Access Grants Enabled"
 */
export async function directLogin(username: string, password: string): Promise<User> {
  const tokenUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: keycloakConfig.clientId,
      username,
      password,
      scope: "openid profile email",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.error === "invalid_grant") {
      throw new Error("Invalid email or password");
    }
    throw new Error(errorData.error_description || "Authentication failed");
  }

  const tokenResponse = await response.json();

  // Create a User object compatible with oidc-client-ts
  const manager = getUserManager();

  // Parse the ID token to get user info
  const idTokenParts = tokenResponse.id_token.split(".");
  const idTokenPayload = JSON.parse(atob(idTokenParts[1]));

  const user = new User({
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type || "Bearer",
    id_token: tokenResponse.id_token,
    refresh_token: tokenResponse.refresh_token,
    profile: {
      sub: idTokenPayload.sub,
      iss: idTokenPayload.iss,
      aud: idTokenPayload.aud,
      exp: idTokenPayload.exp,
      iat: idTokenPayload.iat,
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      preferred_username: idTokenPayload.preferred_username,
      email_verified: idTokenPayload.email_verified,
      picture: idTokenPayload.picture,
    },
    expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
    scope: tokenResponse.scope,
    session_state: tokenResponse.session_state,
  });

  // Store the user in the UserManager
  await manager.storeUser(user);

  return user;
}

// Export types
export type { User };
