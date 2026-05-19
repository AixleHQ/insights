import { UserManager, User, Log } from "oidc-client-ts";
import type { UserManagerSettings } from "oidc-client-ts";
import { config } from "./config";

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
export async function login(): Promise<void> {
  const manager = getUserManager();
  await manager.signinRedirect();
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
        // Return the existing token anyway - it might still work
      }
    }
  }

  return user?.access_token ?? null;
}

export async function silentRenew(): Promise<User | null> {
  const manager = getUserManager();
  try {
    return await manager.signinSilent();
  } catch (error) {
    console.error("[Auth] Silent renew failed:", error);
    return null;
  }
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
