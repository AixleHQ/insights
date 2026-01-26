/**
 * API Hooks using TanStack Query
 *
 * These hooks provide data fetching with caching, background refetching,
 * and optimistic updates for all API resources.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CurrentUser,
  Organization,
  OrganizationMember,
  Project,
  ProjectWithStats,
  Connector,
  ToolAccount,
  ToolEvent,
  EventAuditEntry,
  OverviewStats,
  DailyStats,
  HourlyStats,
  ToolUsageStats,
  Alert,
  PaginatedResponse,
  RetentionPolicy,
} from '@/lib/types';

// Query keys factory
export const queryKeys = {
  user: {
    current: ['user', 'current'] as const,
    organizations: ['user', 'organizations'] as const,
    settings: ['user', 'settings'] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    detail: (id: string) => ['organizations', id] as const,
    stats: (id: string) => ['organizations', id, 'stats'] as const,
  },
  members: {
    all: (orgId: string) => ['organizations', orgId, 'members'] as const,
    detail: (orgId: string, id: string) => ['organizations', orgId, 'members', id] as const,
  },
  projects: {
    all: (orgId: string) => ['organizations', orgId, 'projects'] as const,
    detail: (id: string) => ['projects', id] as const,
  },
  connectors: {
    all: (orgId: string) => ['organizations', orgId, 'connectors'] as const,
    detail: (orgId: string, id: string) => ['organizations', orgId, 'connectors', id] as const,
  },
  toolAccounts: {
    all: (orgId: string) => ['organizations', orgId, 'tool_accounts'] as const,
  },
  events: {
    all: (orgId: string, params?: Record<string, unknown>) =>
      ['organizations', orgId, 'events', params] as const,
    detail: (orgId: string, id: string) => ['organizations', orgId, 'events', id] as const,
    auditTrail: (orgId: string, id: string) =>
      ['organizations', orgId, 'events', id, 'audit_trail'] as const,
    unattributed: (orgId: string) => ['organizations', orgId, 'events', 'unattributed'] as const,
    summary: (orgId: string) => ['organizations', orgId, 'events', 'summary'] as const,
  },
  stats: {
    overview: (orgId: string) => ['organizations', orgId, 'stats', 'overview'] as const,
    daily: (orgId: string, days?: number) =>
      ['organizations', orgId, 'stats', 'daily', days] as const,
    hourly: (orgId: string, hours?: number) =>
      ['organizations', orgId, 'stats', 'hourly', hours] as const,
  },
  alerts: {
    all: (orgId: string) => ['organizations', orgId, 'alerts'] as const,
  },
};

// ============================================================================
// User Hooks
// ============================================================================

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => api.get<CurrentUser>('/users/me'),
  });
}

export function useUserOrganizations() {
  return useQuery({
    queryKey: queryKeys.user.organizations,
    queryFn: () => api.get<Organization[]>('/users/me/organizations'),
  });
}

// ============================================================================
// Organization Hooks
// ============================================================================

export function useOrganization(id: string) {
  return useQuery({
    queryKey: queryKeys.organizations.detail(id),
    queryFn: () => api.get<Organization>(`/organizations/${id}`),
    enabled: !!id,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Organization> }) =>
      api.patch<Organization>(`/organizations/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.detail(id) });
    },
  });
}

export function useRetentionPolicy(orgId: string) {
  return useQuery({
    queryKey: ['organizations', orgId, 'retention_policy'],
    queryFn: () => api.get<RetentionPolicy>(`/organizations/${orgId}/retention_policy`),
    enabled: !!orgId,
  });
}

export function useUpdateRetentionPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: Partial<RetentionPolicy> }) =>
      api.patch<RetentionPolicy>(`/organizations/${orgId}/retention_policy`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'retention_policy'] });
    },
  });
}

// ============================================================================
// Organization Members Hooks
// ============================================================================

export function useOrganizationMembers(orgId: string) {
  return useQuery({
    queryKey: queryKeys.members.all(orgId),
    queryFn: () => api.get<OrganizationMember[]>(`/organizations/${orgId}/members`),
    enabled: !!orgId,
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, email, role }: { orgId: string; email: string; role: string }) =>
      api.post<OrganizationMember>(`/organizations/${orgId}/members`, { email, role }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(orgId) });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId, role }: { orgId: string; memberId: string; role: string }) =>
      api.patch<OrganizationMember>(`/organizations/${orgId}/members/${memberId}`, { role }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(orgId) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: string; memberId: string }) =>
      api.delete(`/organizations/${orgId}/members/${memberId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(orgId) });
    },
  });
}

// ============================================================================
// Projects Hooks
// ============================================================================

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: queryKeys.projects.all(orgId),
    queryFn: () => api.get<ProjectWithStats[]>(`/organizations/${orgId}/projects`),
    enabled: !!orgId,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => api.get<ProjectWithStats>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: Partial<Project> }) =>
      api.post<Project>(`/organizations/${orgId}/projects`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(orgId) });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      api.patch<Project>(`/projects/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

// ============================================================================
// Connectors Hooks
// ============================================================================

export function useConnectors(orgId: string) {
  return useQuery({
    queryKey: queryKeys.connectors.all(orgId),
    queryFn: () => api.get<Connector[]>(`/organizations/${orgId}/connectors`),
    enabled: !!orgId,
  });
}

export function useConnectorAuthorizeUrl(orgId: string, provider: string) {
  return useQuery({
    queryKey: ['connectors', 'authorize', orgId, provider],
    queryFn: () =>
      api.get<{ url: string }>(`/organizations/${orgId}/connectors/authorize/${provider}`),
    enabled: false, // Only fetch when explicitly called
  });
}

export function useCreateConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      code,
      provider,
    }: {
      orgId: string;
      code: string;
      provider: string;
    }) => api.post<Connector>(`/organizations/${orgId}/connectors/callback`, { code, provider }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all(orgId) });
    },
  });
}

export function useSyncConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectorId }: { orgId: string; connectorId: string }) =>
      api.post(`/organizations/${orgId}/connectors/${connectorId}/sync`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all(orgId) });
    },
  });
}

export function useDeleteConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectorId }: { orgId: string; connectorId: string }) =>
      api.delete(`/organizations/${orgId}/connectors/${connectorId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all(orgId) });
    },
  });
}

// ============================================================================
// Tool Accounts Hooks
// ============================================================================

export function useToolAccounts(orgId: string) {
  return useQuery({
    queryKey: queryKeys.toolAccounts.all(orgId),
    queryFn: () => api.get<ToolAccount[]>(`/organizations/${orgId}/tool_accounts`),
    enabled: !!orgId,
  });
}

export function useCreateToolAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      provider,
      code,
    }: {
      orgId: string;
      provider: string;
      code: string;
    }) => api.post<ToolAccount>(`/organizations/${orgId}/tool_accounts`, { provider, code }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolAccounts.all(orgId) });
    },
  });
}

export function useDeleteToolAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, accountId }: { orgId: string; accountId: string }) =>
      api.delete(`/organizations/${orgId}/tool_accounts/${accountId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolAccounts.all(orgId) });
    },
  });
}

// ============================================================================
// Events Hooks
// ============================================================================

export interface EventsParams {
  [key: string]: string | number | undefined;
  page?: number;
  per_page?: number;
  tool_name?: string;
  risk_level?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  user_id?: string;
  project_id?: string;
}

export function useEvents(orgId: string, params?: EventsParams) {
  return useQuery({
    queryKey: queryKeys.events.all(orgId, params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, String(value));
          }
        });
      }
      const query = searchParams.toString();
      return api.get<PaginatedResponse<ToolEvent>>(
        `/organizations/${orgId}/events${query ? `?${query}` : ''}`
      );
    },
    enabled: !!orgId,
  });
}

export function useEvent(orgId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(orgId, id),
    queryFn: () => api.get<ToolEvent>(`/organizations/${orgId}/events/${id}`),
    enabled: !!orgId && !!id,
  });
}

export function useEventAuditTrail(orgId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.events.auditTrail(orgId, id),
    queryFn: () => api.get<EventAuditEntry[]>(`/organizations/${orgId}/events/${id}/audit_trail`),
    enabled: !!orgId && !!id,
  });
}

export function useUnattributedEvents(orgId: string) {
  return useQuery({
    queryKey: queryKeys.events.unattributed(orgId),
    queryFn: () => api.get<ToolEvent[]>(`/organizations/${orgId}/events/unattributed`),
    enabled: !!orgId,
  });
}

// ============================================================================
// Stats Hooks
// ============================================================================

export function useOverviewStats(orgId: string) {
  return useQuery({
    queryKey: queryKeys.stats.overview(orgId),
    queryFn: () => api.get<OverviewStats>(`/organizations/${orgId}/stats/overview`),
    enabled: !!orgId,
    refetchInterval: 30000, // Refetch every 30 seconds for live dashboard
  });
}

export function useDailyStats(orgId: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.daily(orgId, days),
    queryFn: () =>
      api.get<{ data: DailyStats[]; tool_breakdown: ToolUsageStats[] }>(
        `/organizations/${orgId}/stats/daily?days=${days}`
      ),
    enabled: !!orgId,
  });
}

export function useHourlyStats(orgId: string, hours = 24) {
  return useQuery({
    queryKey: queryKeys.stats.hourly(orgId, hours),
    queryFn: () => api.get<HourlyStats[]>(`/organizations/${orgId}/stats/hourly?hours=${hours}`),
    enabled: !!orgId,
  });
}

interface ActivityHeatmapData {
  date: string;
  count: number;
}

export function useActivityHeatmap(orgId: string) {
  return useQuery({
    queryKey: ['organizations', orgId, 'stats', 'heatmap'],
    queryFn: () => api.get<ActivityHeatmapData[]>(`/organizations/${orgId}/stats/heatmap`),
    enabled: !!orgId,
  });
}

// ============================================================================
// Alerts Hooks (if implemented)
// ============================================================================

export function useAlerts(orgId: string) {
  return useQuery({
    queryKey: queryKeys.alerts.all(orgId),
    queryFn: () => api.get<Alert[]>(`/organizations/${orgId}/alerts`),
    enabled: !!orgId,
  });
}
