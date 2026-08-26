declare global {
  interface Window {
    __APP_CONFIG__?: {
      keycloakUrl?: string;
      keycloakRealm?: string;
      keycloakClientId?: string;
      apiUrl?: string;
      rollbarClientToken?: string;
      showPromptInsightsSectionInPersonalDashboard?: string;
      appEnv?: string;
    };
  }
}

// keycloakUrl is reliably set per environment by the deploy pipeline (unlike
// APP_ENV, which has been observed missing on some containers) — use its
// hostname as a fallback signal when APP_ENV wasn't resolved.
const KEYCLOAK_HOST_TO_ENV: Record<string, string> = {
  "auth-staging.insights.example.com": "staging",
  "auth.insights.example.com": "production",
};

function inferEnvFromKeycloakUrl(keycloakUrl: string | undefined): string | null {
  if (!keycloakUrl) return null;
  try {
    return KEYCLOAK_HOST_TO_ENV[new URL(keycloakUrl).hostname] ?? null;
  } catch {
    return null;
  }
}

export const config = {
  keycloakUrl: window.__APP_CONFIG__?.keycloakUrl || import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  keycloakRealm: window.__APP_CONFIG__?.keycloakRealm || import.meta.env.VITE_KEYCLOAK_REALM || "db90",
  keycloakClientId: window.__APP_CONFIG__?.keycloakClientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "db90-web",
  apiUrl: window.__APP_CONFIG__?.apiUrl || import.meta.env.VITE_API_URL || "/api/v1",
  rollbarClientToken: window.__APP_CONFIG__?.rollbarClientToken || "",
  showPromptInsightsSectionInPersonalDashboard: window.__APP_CONFIG__?.showPromptInsightsSectionInPersonalDashboard || "false",
  appEnv: window.__APP_CONFIG__
    ? window.__APP_CONFIG__.appEnv || inferEnvFromKeycloakUrl(window.__APP_CONFIG__.keycloakUrl) || "unknown"
    : import.meta.env.MODE,
};
