/**
 * Centralized application route definitions.
 *
 * Static routes are string constants; routes with dynamic segments are helper
 * functions that build the path from their parameters. Always reference these
 * instead of hardcoding path strings in components, so a path change only ever
 * needs one edit.
 *
 * For routes that take query params, append them to the base path returned here
 * (e.g. `${AppRoutes.events.root}?tool_name=foo`).
 */
export const AppRoutes = {
  // Auth & public
  login: "/login",
  authCallback: "/auth/callback",
  authSilentCallback: "/auth/silent-callback",
  authIframeCallback: "/auth/iframe-callback",
  authPopupCallback: "/auth/popup-callback",
  onboarding: "/onboarding",
  noActiveOrganization: "/no-active-organization",
  invitation: (token: string) => `/invitations/${token}`,

  // Core
  dashboard: "/",
  notifications: "/notifications",
  alerts: "/alerts",
  exports: "/exports",
  // Events
  events: {
    root: "/events",
    unattributed: "/events/unattributed",
    detail: (id: string) => `/events/${id}`,
  },

  // Projects
  projects: {
    root: "/projects",
    new: "/projects/new",
    detail: (id: string) => `/projects/${id}`,
    edit: (id: string) => `/projects/${id}/edit`,
    settings: (id: string) => `/projects/${id}/settings`,
    settingsTab: (id: string, tab: string) => `/projects/${id}/settings/${tab}`,
  },

  // Integrations
  integrations: {
    root: "/integrations",
    connected: "/integrations/connected",
    manage: "/integrations/manage",
    callback: "/integrations/callback",
    setup: (provider: string) => `/integrations/new/${provider}`,
    byStatus: (status: string) => `/integrations/${status}`,
  },

  // Members
  members: {
    root: "/members",
    invite: "/members/invite",
    invitations: "/members/invitations",
    detail: (id: string) => `/members/${id}`,
  },

  // Settings (organization)
  settings: {
    root: "/settings",
    policies: "/settings/policies",
    retention: "/settings/retention",
    alerts: "/settings/alerts",
    pricing: "/settings/pricing",
    security: "/settings/security",
  },

  // Profile (user settings)
  profile: {
    root: "/profile",
    tools: "/profile/tools",
    settings: "/profile/settings",
    settingsNotifications: "/profile/settings/notifications",
    settingsSecurity: "/profile/settings/security",
  },

  // Admin
  admin: {
    root: "/admin",
    users: "/admin/users",
    organizations: "/admin/organizations",
    orgWebhookDeliveries: (orgId: string) =>
      `/admin/organizations/${orgId}/webhook-deliveries`,
  },
} as const;

/**
 * Guards against open-redirect: only same-origin relative paths (e.g. a
 * `?redirect=` query param, or an OIDC `state` round-tripped through login)
 * are safe to navigate to. Rejects absolute URLs and protocol-relative paths
 * (`//evil.com`).
 */
export function isSafeRedirectPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/**
 * True when a redirect target is owned by the Rails-served Administrate panel
 * (mounted at /admin) rather than an SPA route. Such paths must be reached via a
 * real browser navigation (window.location.assign), not React Router's navigate() —
 * nginx/vite proxy /admin straight to the API and no SPA route exists for e.g.
 * /admin/login, so a client-side navigate() would silently no-op (AIX-568).
 */
export function isAdminPath(path: string): boolean {
  return path === AppRoutes.admin.root || path.startsWith(`${AppRoutes.admin.root}/`);
}
