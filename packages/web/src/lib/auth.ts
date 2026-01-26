import { UserManager, User, Log } from 'oidc-client-ts';
import type { UserManagerSettings } from 'oidc-client-ts';

// Enable logging in development
if (import.meta.env.DEV) {
  Log.setLogger(console);
  Log.setLevel(Log.INFO);
}

// Keycloak configuration
const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'db90',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'db90-web',
};

// OIDC User Manager settings
const settings: UserManagerSettings = {
  authority: `${keycloakConfig.url}/realms/${keycloakConfig.realm}`,
  client_id: keycloakConfig.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  silentRequestTimeoutInSeconds: 10,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  filterProtocolClaims: true,
  loadUserInfo: true,
  monitorSession: true,
};

// Create singleton UserManager instance
let userManager: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!userManager) {
    userManager = new UserManager(settings);

    // Set up event handlers
    userManager.events.addAccessTokenExpiring(() => {
      console.log('[Auth] Access token expiring...');
    });

    userManager.events.addAccessTokenExpired(() => {
      console.log('[Auth] Access token expired');
    });

    userManager.events.addSilentRenewError((error) => {
      console.error('[Auth] Silent renew error:', error);
    });

    userManager.events.addUserLoaded((user) => {
      console.log('[Auth] User loaded:', user.profile.email);
    });

    userManager.events.addUserUnloaded(() => {
      console.log('[Auth] User unloaded');
    });

    userManager.events.addUserSignedOut(() => {
      console.log('[Auth] User signed out');
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
  return manager.signinRedirectCallback();
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
  const user = await getUser();
  return user?.access_token ?? null;
}

export async function silentRenew(): Promise<User | null> {
  const manager = getUserManager();
  try {
    return await manager.signinSilent();
  } catch (error) {
    console.error('[Auth] Silent renew failed:', error);
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
    email: user.profile.email ?? '',
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
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

// Export types
export type { User };
