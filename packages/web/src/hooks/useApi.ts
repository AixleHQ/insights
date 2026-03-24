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
  ProjectConnector,
  ToolAccount,
  ToolEvent,
  EventAuditEntry,
  OrganizationAuditLog,
  ProjectAuditLog,
  OverviewStats,
  DailyStats,
  HourlyStats,
  ToolUsageStats,
  Alert,
  PaginatedResponse,
  RetentionPolicy,
  Invitation,
  InvitationPublic,
  MemberRole,
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
    events: (orgId: string, id: string) => ['organizations', orgId, 'members', id, 'events'] as const,
    stats: (orgId: string, id: string) => ['organizations', orgId, 'members', id, 'stats'] as const,
  },
  projects: {
    all: (orgId: string) => ['organizations', orgId, 'projects'] as const,
    detail: (id: string) => ['projects', id] as const,
  },
  connectors: {
    all: (orgId: string) => ['organizations', orgId, 'connectors'] as const,
    detail: (orgId: string, id: string) => ['organizations', orgId, 'connectors', id] as const,
  },
  projectConnectors: {
    all: (projectId: string) => ['projects', projectId, 'connectors'] as const,
    detail: (projectId: string, id: string) => ['projects', projectId, 'connectors', id] as const,
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
  invitations: {
    all: (orgId: string) => ['organizations', orgId, 'invitations'] as const,
    detail: (orgId: string, id: string) => ['organizations', orgId, 'invitations', id] as const,
    byToken: (token: string) => ['invitations', token] as const,
    check: ['invitations', 'check'] as const,
  },
  auditLogs: {
    all: (orgId: string, params?: Record<string, unknown>) =>
      ['organizations', orgId, 'audit_logs', params] as const,
  },
  projectAuditLogs: {
    all: (projectId: string, params?: Record<string, unknown>) =>
      ['projects', projectId, 'audit_logs', params] as const,
  },
};

// ============================================================================
// User Hooks
// ============================================================================

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user.current,
    queryFn: async () => {
      const response = await api.get<{ data: CurrentUser }>('/users/me');
      return response.data;
    },
  });
}

export function useUserOrganizations() {
  return useQuery({
    queryKey: queryKeys.user.organizations,
    queryFn: async () => {
      const response = await api.get<{ data: Organization[] }>('/users/me/organizations');
      return response.data;
    },
  });
}

// ============================================================================
// Organization Hooks
// ============================================================================

export function useOrganization(id: string) {
  return useQuery({
    queryKey: queryKeys.organizations.detail(id),
    queryFn: async () => {
      const response = await api.get<{ data: Organization }>(`/organizations/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.post<Organization>('/organizations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.organizations });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Organization> }) =>
      api.patch<Organization>(`/organizations/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.organizations });
    },
  });
}

export function useLeaveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: string; memberId: string }) =>
      api.delete(`/organizations/${orgId}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.organizations });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
    },
  });
}

export function useRetentionPolicy(orgId: string) {
  return useQuery({
    queryKey: ['organizations', orgId, 'retention_policy'],
    queryFn: async () => {
      const response = await api.get<{ data: RetentionPolicy }>(`/organizations/${orgId}/retention_policy`);
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useUpdateRetentionPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: Record<string, string> }) =>
      api.patch<{ data: RetentionPolicy }>(`/organizations/${orgId}/retention_policy`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'retention_policy'] });
    },
  });
}

// Organization Settings (key-value store)
export function useOrganizationSettings(orgId: string) {
  return useQuery({
    queryKey: ['organizations', orgId, 'settings'],
    queryFn: () => api.get<Record<string, unknown>>(`/organizations/${orgId}/settings`),
    enabled: !!orgId,
  });
}

export function useUpdateOrganizationSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, key, value }: { orgId: string; key: string; value: unknown }) =>
      api.put(`/organizations/${orgId}/settings/${key}`, { value }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'settings'] });
    },
  });
}

export function useDeleteOrganizationSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, key }: { orgId: string; key: string }) =>
      api.delete(`/organizations/${orgId}/settings/${key}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'settings'] });
    },
  });
}

// Project Settings (key-value store)
export interface ProjectSettingEntry {
  key: string;
  value: string;
}

export interface ProjectSettingsResponse {
  data: ProjectSettingEntry[];
}

export function useProjectSettings(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'settings'],
    queryFn: () => api.get<ProjectSettingsResponse>(`/projects/${projectId}/settings`),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useUpdateProjectSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, key, value }: { projectId: string; key: string; value: string }) =>
      api.put(`/projects/${projectId}/settings/${key}`, { value }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'settings'] });
    },
  });
}

export function useDeleteProjectSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, key }: { projectId: string; key: string }) =>
      api.delete(`/projects/${projectId}/settings/${key}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'settings'] });
    },
  });
}

// ============================================================================
// Organization Members Hooks
// ============================================================================

export function useOrganizationMembers(orgId: string) {
  return useQuery({
    queryKey: queryKeys.members.all(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: OrganizationMember[] }>(`/organizations/${orgId}/members`);
      return response.data;
    },
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

export interface MemberDetail extends OrganizationMember {
  stats?: {
    total_events: number;
    total_cost: number;
    events_today: number;
    events_this_week: number;
    most_used_tool: string | null;
  };
}

export function useMember(orgId: string, memberId: string) {
  return useQuery({
    queryKey: queryKeys.members.detail(orgId, memberId),
    queryFn: async () => {
      const response = await api.get<{ data: MemberDetail }>(`/organizations/${orgId}/members/${memberId}`);
      return response.data;
    },
    enabled: !!orgId && !!memberId,
  });
}

export function useMemberEvents(orgId: string, memberId: string, params?: EventsParams) {
  return useQuery({
    queryKey: queryKeys.members.events(orgId, memberId),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, String(value));
          }
        });
      }
      const query = searchParams.toString();
      const response = await api.get<PaginatedResponse<ToolEvent>>(
        `/organizations/${orgId}/members/${memberId}/events${query ? `?${query}` : ''}`
      );
      return response;
    },
    enabled: !!orgId && !!memberId,
  });
}

export interface MemberStats {
  total_events: number;
  total_cost: number;
  events_today: number;
  events_this_week: number;
  events_this_month: number;
  most_used_tool: string | null;

  // Token metrics
  tokens: {
    total_in: number;
    total_out: number;
    total: number;
  };

  // Breakdowns
  tool_breakdown: {
    tool: string;
    count: number;
    cost: number;
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    price_per_million_input: number;
    price_per_million_output: number;
  }[];
  model_breakdown: {
    model: string;
    count: number;
    cost: number;
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    price_per_million_input: number;
    price_per_million_output: number;
  }[];
  daily_activity: { date: string; count: number; tokens: number }[];

  // Related entities
  projects: {
    id: string;
    name: string;
    slug: string;
    from_events?: boolean;
  }[];
  organizations: {
    id: string;
    name: string;
    slug: string;
    role: string;
    is_current: boolean;
  }[];
  tool_accounts: {
    id: string;
    tool_name: string;
    external_username: string | null;
    is_active: boolean;
  }[];
}

export function useMemberStats(orgId: string, memberId: string) {
  return useQuery({
    queryKey: queryKeys.members.stats(orgId, memberId),
    queryFn: async () => {
      const response = await api.get<MemberStats>(`/organizations/${orgId}/members/${memberId}/stats`);
      return response;
    },
    enabled: !!orgId && !!memberId,
  });
}

// ============================================================================
// Projects Hooks
// ============================================================================

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: queryKeys.projects.all(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: ProjectWithStats[] }>(`/organizations/${orgId}/projects`);
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: async () => {
      const response = await api.get<{ data: ProjectWithStats }>(`/projects/${id}`);
      return response.data;
    },
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
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
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

// Project stats for activity charts
export interface ProjectStatsData {
  date: string;
  eventCount: number;
  costUsd: number;
}

export interface ProjectStatsResponse {
  daily: ProjectStatsData[];
  totalEvents: number;
  totalCost: number;
}

export function useProjectStats(projectId: string, days = 30) {
  return useQuery({
    queryKey: ['projects', projectId, 'stats', days],
    queryFn: () => api.get<ProjectStatsResponse>(`/projects/${projectId}/stats?days=${days}`),
    enabled: !!projectId,
  });
}

// Project daily by tool for stacked bar chart
export function useProjectDailyByTool(projectId: string, days = 30) {
  return useQuery({
    queryKey: ['projects', projectId, 'stats', 'daily_by_tool', days],
    queryFn: () => api.get<DailyByToolResponse>(`/projects/${projectId}/stats/daily_by_tool?days=${days}`),
    enabled: !!projectId,
  });
}

// Project members
export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'members'],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectMember[] }>(`/projects/${projectId}/members`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

// Project repositories
export interface ProjectRepository {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  url: string;
  lastSyncAt: string | null;
  isActive: boolean;
}

export function useProjectRepositories(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'repositories'],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectRepository[] }>(`/projects/${projectId}/repositories`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

// ============================================================================
// Connectors Hooks
// ============================================================================

export function useConnectors(orgId: string) {
  return useQuery({
    queryKey: queryKeys.connectors.all(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: Connector[] }>(`/organizations/${orgId}/connectors`);
      return response.data;
    },
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

export function useConnectWithApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      connectorType,
      apiKey,
    }: {
      orgId: string;
      connectorType: string;
      apiKey: string;
    }) =>
      api.post<Connector>(`/organizations/${orgId}/connectors`, {
        connector_type: connectorType,
        access_token: apiKey,
      }),
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

export function useConnectWithWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      webhookUrl,
      channelLabel,
    }: {
      orgId: string;
      webhookUrl: string;
      channelLabel?: string;
    }) =>
      api.post<Connector>(`/organizations/${orgId}/connectors`, {
        connector_type: 'slack',
        access_token: webhookUrl,
        ...(channelLabel ? { external_account_name: channelLabel } : {}),
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all(orgId) });
    },
  });
}

export function useTestConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectorId }: { orgId: string; connectorId: string }) =>
      api.post<{ data: { success: boolean; message?: string; error?: string } }>(
        `/organizations/${orgId}/connectors/${connectorId}/test`
      ),
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all(orgId) });
    },
  });
}

// ============================================================================
// Project Connectors Hooks
// ============================================================================

export function useProjectConnectors(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectConnectors.all(projectId),
    queryFn: async () => {
      const response = await api.get<{ data: ProjectConnector[] }>(`/projects/${projectId}/connectors`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useProjectConnectWithApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      connectorType,
      apiKey,
    }: {
      projectId: string;
      connectorType: string;
      apiKey: string;
    }) =>
      api.post<ProjectConnector>(`/projects/${projectId}/connectors`, {
        connector_type: connectorType,
        access_token: apiKey,
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectConnectors.all(projectId) });
    },
  });
}

export function useProjectConnectWithSlack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      webhookUrl,
      channelLabel,
    }: {
      projectId: string;
      webhookUrl: string;
      channelLabel?: string;
    }) =>
      api.post<ProjectConnector>(`/projects/${projectId}/connectors`, {
        connector_type: 'slack',
        access_token: webhookUrl,
        ...(channelLabel ? { external_org_name: channelLabel } : {}),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectConnectors.all(projectId) });
    },
  });
}

export function useProjectDeleteConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, connectorId }: { projectId: string; connectorId: string }) =>
      api.delete(`/projects/${projectId}/connectors/${connectorId}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectConnectors.all(projectId) });
    },
  });
}

export function useProjectTestConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, connectorId }: { projectId: string; connectorId: string }) =>
      api.post<{ data: { success: boolean; message?: string; error?: string } }>(
        `/projects/${projectId}/connectors/${connectorId}/test`
      ),
    onSettled: (_, __, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectConnectors.all(projectId) });
    },
  });
}

// ============================================================================
// Tool Accounts Hooks
// ============================================================================

export function useToolAccounts(orgId: string) {
  return useQuery({
    queryKey: queryKeys.toolAccounts.all(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: ToolAccount[] }>(`/organizations/${orgId}/tool_accounts`);
      return response.data;
    },
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
    queryFn: async () => {
      const response = await api.get<{ data: ToolEvent }>(`/organizations/${orgId}/events/${id}`);
      return response.data;
    },
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
    queryFn: async () => {
      const response = await api.get<{ data: ToolEvent[] }>(`/organizations/${orgId}/events/unattributed`);
      return response.data;
    },
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

export interface DailyToolData {
  date: string;
  [toolName: string]: string | number; // date is string, tool counts are numbers
}

export interface DailyByToolResponse {
  data: DailyToolData[];
  tools: string[];
}

export function useDailyByTool(orgId: string, days = 30) {
  return useQuery({
    queryKey: ['organizations', orgId, 'stats', 'daily_by_tool', days],
    queryFn: () => api.get<DailyByToolResponse>(`/organizations/${orgId}/stats/daily_by_tool?days=${days}`),
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

// ============================================================================
// Invitation Hooks
// ============================================================================

export function useInvitations(orgId: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.invitations.all(orgId),
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const response = await api.get<{ data: Invitation[] }>(`/organizations/${orgId}/invitations${params}`);
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, email, role }: { orgId: string; email: string; role: MemberRole }) =>
      api.post<{ data: Invitation }>(`/organizations/${orgId}/invitations`, { email, role }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all(orgId) });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: string; invitationId: string }) =>
      api.delete(`/organizations/${orgId}/invitations/${invitationId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all(orgId) });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: string; invitationId: string }) =>
      api.post<{ data: Invitation }>(`/organizations/${orgId}/invitations/${invitationId}/resend`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all(orgId) });
    },
  });
}

// Public invitation endpoints (for viewing and accepting invitations)
export function useInvitationByToken(token: string) {
  return useQuery({
    queryKey: queryKeys.invitations.byToken(token),
    queryFn: async () => {
      const response = await api.get<{ data: InvitationPublic }>(`/invitations/${token}`, { skipAuth: true });
      return response.data;
    },
    enabled: !!token,
    retry: false, // Don't retry on 404
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) =>
      api.post<{ message: string; data: { organization: { id: string; name: string; slug: string }; role: string } }>(
        `/invitations/${token}/accept`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.organizations });
    },
  });
}

export function useCheckPendingInvitations() {
  return useQuery({
    queryKey: queryKeys.invitations.check,
    queryFn: async () => {
      const response = await api.get<{ data: InvitationPublic[] }>('/invitations/check');
      return response.data;
    },
  });
}

// ============================================================================
// Audit Log Hooks
// ============================================================================

export interface AuditLogFilters {
  page?: number;
  per_page?: number;
  actor_id?: string;
  log_action?: string;
  resource_type?: string;
  from_date?: string;
  to_date?: string;
}

export function useOrganizationAuditLogs(orgId: string, filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs.all(orgId, filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.per_page) params.set('per_page', String(filters.per_page));
      if (filters.actor_id) params.set('actor_id', filters.actor_id);
      if (filters.log_action) params.set('log_action', filters.log_action);
      if (filters.resource_type) params.set('resource_type', filters.resource_type);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      const query = params.toString();
      return api.get<PaginatedResponse<OrganizationAuditLog>>(
        `/organizations/${orgId}/audit_logs${query ? `?${query}` : ''}`
      );
    },
    enabled: !!orgId,
  });
}

export function useProjectAuditLogs(projectId: string, filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.projectAuditLogs.all(projectId, filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.per_page) params.set('per_page', String(filters.per_page));
      if (filters.actor_id) params.set('actor_id', filters.actor_id);
      if (filters.log_action) params.set('log_action', filters.log_action);
      if (filters.resource_type) params.set('resource_type', filters.resource_type);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      const query = params.toString();
      return api.get<PaginatedResponse<ProjectAuditLog>>(
        `/projects/${projectId}/audit_logs${query ? `?${query}` : ''}`
      );
    },
    enabled: !!projectId,
  });
}
