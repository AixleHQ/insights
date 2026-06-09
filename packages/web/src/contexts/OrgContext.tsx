import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useImpersonation } from "./ImpersonationContext";
import { setCurrentOrganizationId, getAuthToken } from "../lib/api";

export type MemberRole = "owner" | "member" | "viewer";

// Organization type matching the Rails API response
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  user_role?: MemberRole;
}

// Organization membership derived from API response
export interface OrganizationMembership {
  organization: Organization;
  role: MemberRole;
}

interface OrgState {
  currentOrg: Organization | null;
  organizations: Organization[];
  memberships: OrganizationMembership[];
  isLoading: boolean;
  isInitialized: boolean;
  error: Error | null;
}

interface OrgContextValue extends OrgState {
  setCurrentOrg: (org: Organization | null) => void;
  refreshOrganizations: () => Promise<void>;
  hasRole: (role: string | string[]) => boolean;
  currentMembership: OrganizationMembership | null;
  currentRole: MemberRole | null;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const ORG_STORAGE_KEY = "db90_current_org_id";

interface OrgProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

export function OrgProvider({ children, apiBaseUrl = "/api/v1" }: OrgProviderProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isImpersonating } = useImpersonation();

  const [state, setState] = useState<OrgState>({
    currentOrg: null,
    organizations: [],
    memberships: [],
    isLoading: false,
    isInitialized: false,
    error: null,
  });

  // Fetch organizations when authenticated
  const refreshOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setState((prev) => ({
        ...prev,
        currentOrg: null,
        organizations: [],
        memberships: [],
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, isInitialized: false, error: null }));

    try {
      const token = await getAuthToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // Fetch orgs and user settings in parallel
      const [response, userResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/users/me/organizations`, { headers }),
        fetch(`${apiBaseUrl}/users/me`, { headers }).catch(() => null),
      ]);

      if (!response.ok) {
        throw new Error(`Failed to fetch organizations: ${response.status}`);
      }

      const data = await response.json();
      // API returns { data: Organization[], meta: {...} }
      // Each organization includes userRole field (camelCase from API)
      const orgsWithRoles = data.data || [];
      const organizations: Organization[] = orgsWithRoles.map((org: Record<string, unknown>) => ({
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        description: org.description as string | undefined,
        is_active: org.isActive as boolean,
        user_role: (org.userRole as MemberRole) || "member",
      }));
      const memberships: OrganizationMembership[] = organizations.map((org) => ({
        organization: org,
        role: org.user_role || "member",
      }));

      // Read default_org_id from user settings (non-fatal if unavailable)
      let defaultOrgId: string | null = null;
      if (userResponse?.ok) {
        const userData = await userResponse.json();
        defaultOrgId = (userData.data?.settings?.default_org_id as string) ?? null;
      }

      // Select org: last used (localStorage) > default_org_id preference > first org
      // localStorage represents the user's explicit selection and takes highest priority.
      // default_org_id is only used as a fallback when the user has never switched orgs.
      const storedOrgId = localStorage.getItem(ORG_STORAGE_KEY);

      let currentOrg: Organization | null = null;

      if (storedOrgId) {
        currentOrg = organizations.find((o) => o.id === storedOrgId) || null;
      }

      if (!currentOrg && defaultOrgId) {
        currentOrg = organizations.find((o) => o.id === defaultOrgId) || null;
      }

      if (!currentOrg && organizations.length > 0) {
        if (storedOrgId) {
          // Avoid leaking org UUIDs in production logs
          if (import.meta.env.DEV) {
            console.warn(`[OrgContext] Stored org ${storedOrgId} not found in membership list, switching to first org`);
          } else {
            console.warn("[OrgContext] Stored org not found in membership list, switching to first org");
          }
        }
        currentOrg = organizations[0];
      }

      // Keep localStorage in sync so within-session org switches continue to work
      if (currentOrg && currentOrg.id !== storedOrgId) {
        localStorage.setItem(ORG_STORAGE_KEY, currentOrg.id);
      }

      // Update the global API client state for X-Organization-ID header
      setCurrentOrganizationId(currentOrg?.id || null);

      setState({
        currentOrg,
        organizations,
        memberships,
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error : new Error("Failed to fetch organizations"),
      }));
    }
  }, [isAuthenticated, apiBaseUrl]);

  // Fetch organizations when auth state changes or impersonation toggles
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (isAuthenticated) {
      refreshOrganizations();
    } else {
      setState({
        currentOrg: null,
        organizations: [],
        memberships: [],
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    }
    // isImpersonating toggles when impersonation starts/stops — re-fetch orgs as the right user
  }, [authLoading, isAuthenticated, isImpersonating, refreshOrganizations]);

  // Set current organization
  const setCurrentOrg = useCallback((org: Organization | null) => {
    setState((prev) => ({ ...prev, currentOrg: org }));
    // Update the global API client state for X-Organization-ID header
    setCurrentOrganizationId(org?.id || null);
    if (org) {
      localStorage.setItem(ORG_STORAGE_KEY, org.id);
    } else {
      localStorage.removeItem(ORG_STORAGE_KEY);
    }
  }, []);

  // Get current membership
  const currentMembership = state.currentOrg
    ? state.memberships.find((m) => m.organization.id === state.currentOrg?.id) || null
    : null;

  // Check if user has required role(s) in current org
  const hasRole = useCallback(
    (role: string | string[]): boolean => {
      if (!currentMembership) return false;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(currentMembership.role);
    },
    [currentMembership]
  );

  // Get current role directly
  const currentRole = currentMembership?.role || null;

  const value: OrgContextValue = {
    ...state,
    setCurrentOrg,
    refreshOrganizations,
    hasRole,
    currentMembership,
    currentRole,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return context;
}

// Hook for requiring an organization to be selected
// eslint-disable-next-line react-refresh/only-export-components
export function useRequireOrg(): OrgContextValue & { isReady: boolean } {
  const org = useOrg();
  return {
    ...org,
    isReady: !org.isLoading && org.currentOrg !== null,
  };
}

// Hook for requiring specific roles
// eslint-disable-next-line react-refresh/only-export-components
export function useRequireRole(
  requiredRoles: string | string[]
): OrgContextValue & { hasAccess: boolean } {
  const org = useOrg();
  return {
    ...org,
    hasAccess: org.hasRole(requiredRoles),
  };
}
