declare global {
  interface Window {
    __APP_CONFIG__?: {
      keycloakUrl?: string;
      keycloakRealm?: string;
      keycloakClientId?: string;
      apiUrl?: string;
      rollbarClientToken?: string;
      showPromptInsights?: string;
    };
  }
}

export const config = {
  keycloakUrl: window.__APP_CONFIG__?.keycloakUrl || import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  keycloakRealm: window.__APP_CONFIG__?.keycloakRealm || import.meta.env.VITE_KEYCLOAK_REALM || "db90",
  keycloakClientId: window.__APP_CONFIG__?.keycloakClientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "db90-web",
  apiUrl: window.__APP_CONFIG__?.apiUrl || import.meta.env.VITE_API_URL || "/api/v1",
  rollbarClientToken: window.__APP_CONFIG__?.rollbarClientToken || "",
  showPromptInsights: window.__APP_CONFIG__?.showPromptInsights || "false",
};
