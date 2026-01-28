import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { setCurrentOrganizationId } from '../lib/api';

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

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

const ORG_STORAGE_KEY = 'db90_current_org_id';

interface OrgProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

export function OrgProvider({ children, apiBaseUrl = '/api/v1' }: OrgProviderProps) {
  const { isAuthenticated, getAccessToken } = useAuth();

  const [state, setState] = useState<OrgState>({
    currentOrg: null,
    organizations: [],
    memberships: [],
    isLoading: false,
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

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiBaseUrl}/users/me/organizations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch organizations: ${response.status}`);
      }

      const data = await response.json();
      // API returns { data: Organization[], meta: {...} }
      // Each organization includes user_role field
      const orgsWithRoles: Organization[] = data.data || [];
      const organizations = orgsWithRoles;
      const memberships: OrganizationMembership[] = orgsWithRoles.map((org) => ({
        organization: org,
        role: org.user_role || 'member',
      }));

      // Restore previously selected org from localStorage
      const storedOrgId = localStorage.getItem(ORG_STORAGE_KEY);
      let currentOrg = organizations.find((o) => o.id === storedOrgId) || null;

      // If no stored org or stored org not found, use first org
      if (!currentOrg && organizations.length > 0) {
        currentOrg = organizations[0];
        // Clear invalid stored org ID (e.g., after DB reseed)
        if (storedOrgId) {
          console.warn(`[OrgContext] Stored org ${storedOrgId} not found, switching to ${currentOrg.slug}`);
          localStorage.setItem(ORG_STORAGE_KEY, currentOrg.id);
        }
      }

      // Update the global API client state for X-Organization-ID header
      setCurrentOrganizationId(currentOrg?.id || null);

      setState({
        currentOrg,
        organizations,
        memberships,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to fetch organizations'),
      }));
    }
  }, [isAuthenticated, getAccessToken, apiBaseUrl]);

  // Fetch organizations when auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      refreshOrganizations();
    } else {
      setState({
        currentOrg: null,
        organizations: [],
        memberships: [],
        isLoading: false,
        error: null,
      });
    }
  }, [isAuthenticated, refreshOrganizations]);

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

export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}

// Hook for requiring an organization to be selected
export function useRequireOrg(): OrgContextValue & { isReady: boolean } {
  const org = useOrg();
  return {
    ...org,
    isReady: !org.isLoading && org.currentOrg !== null,
  };
}

// Hook for requiring specific roles
export function useRequireRole(
  requiredRoles: string | string[]
): OrgContextValue & { hasAccess: boolean } {
  const org = useOrg();
  return {
    ...org,
    hasAccess: org.hasRole(requiredRoles),
  };
}
