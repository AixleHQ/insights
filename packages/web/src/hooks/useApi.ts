/**
 * API Hooks using TanStack Query
 *
 * These hooks provide data fetching with caching, background refetching,
 * and optimistic updates for all API resources.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { api, downloadBlob } from "@/lib/api";
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
  UnifiedAuditLog,
  UnifiedPaginatedMeta,
  OverviewStats,
  DailyStats,
  HourlyStats,
  ToolUsageStats,
  Alert,
  PaginatedResponse,
  RetentionPolicy,
  ProjectRetentionPolicy,
  Invitation,
  InvitationPublic,
  MemberRole,
  Issue,
  JiraProject,
  IssueProviderProject,
  ToolOverviewStats,
  ToolModelsResponse,
  ToolUsersResponse,
  ToolDailyResponse,
  ToolEventTypesResponse,
  ConnectorSyncStatus,
  ConnectorHealthRollup,
  ModelPricingResponse,
  ModelPricingOverride,
  ModelPricingOverrideInput,
  ModelPricingOverridesResponse,
  RetentionPreview,
  RetentionPurgeLog,
  UserPersonalSettings,
  NotificationRoute,
  MyToolAccountMetadata,
  McpIngestExchangeData,
} from "@/lib/types";

// Query keys factory
export const queryKeys = {
  user: {
    current: ["user", "current"] as const,
    organizations: ["user", "organizations"] as const,
    settings: ["user", "settings"] as const,
    myToolAccounts: (orgId: string) => ["user", "me", "tool_accounts", orgId] as const,
  },
  organizations: {
    all: ["organizations"] as const,
    detail: (id: string) => ["organizations", id] as const,
    stats: (id: string) => ["organizations", id, "stats"] as const,
  },
  members: {
    all: (orgId: string) => ["organizations", orgId, "members"] as const,
    detail: (orgId: string, id: string) => ["organizations", orgId, "members", id] as const,
    events: (orgId: string, id: string) => ["organizations", orgId, "members", id, "events"] as const,
    stats: (orgId: string, id: string) => ["organizations", orgId, "members", id, "stats"] as const,
    dashboardStats: (orgId: string, userId: string, period: string) =>
      ["organizations", orgId, "members", userId, "dashboard_stats", period] as const,
    heatmap: (orgId: string, userId: string) =>
      ["organizations", orgId, "members", userId, "heatmap"] as const,
    promptInsights: (orgId: string, userId: string, period: string) =>
      ["organizations", orgId, "members", userId, "prompt_insights", period] as const,
  },
  projects: {
    all: (orgId: string) => ["organizations", orgId, "projects"] as const,
    detail: (id: string) => ["projects", id] as const,
  },
  favorites: {
    all: () => ["favorites"] as const,
  },
  connectors: {
    all: (orgId: string) => ["organizations", orgId, "connectors"] as const,
    detail: (orgId: string, id: string) => ["organizations", orgId, "connectors", id] as const,
    availableRepos: (orgId: string, connectorId: string) =>
      ["organizations", orgId, "connectors", connectorId, "available_repos"] as const,
    availableProjects: (orgId: string, connectorId: string) =>
      ["organizations", orgId, "connectors", connectorId, "available_projects"] as const,
    syncStatus: (orgId: string, connectorId: string) =>
      ["organizations", orgId, "connectors", connectorId, "sync_status"] as const,
    health: (orgId: string) =>
      ["organizations", orgId, "connectors", "health"] as const,
  },
  issues: {
    all: (projectId: string, filters?: Record<string, unknown>) =>
      ["projects", projectId, "issues", filters] as const,
    detail: (projectId: string, id: string) => ["projects", projectId, "issues", id] as const,
  },
  projectConnectors: {
    all: (projectId: string) => ["projects", projectId, "connectors"] as const,
    detail: (projectId: string, id: string) => ["projects", projectId, "connectors", id] as const,
  },
  toolAccounts: {
    all: (orgId: string) => ["organizations", orgId, "tool_accounts"] as const,
  },
  events: {
    all: (orgId: string, params?: Record<string, unknown>) =>
      ["organizations", orgId, "events", params] as const,
    detail: (orgId: string, id: string) => ["organizations", orgId, "events", id] as const,
    auditTrail: (orgId: string, id: string) =>
      ["organizations", orgId, "events", id, "audit_trail"] as const,
    unattributed: (orgId: string) => ["organizations", orgId, "events", "unattributed"] as const,
    summary: (orgId: string) => ["organizations", orgId, "events", "summary"] as const,
  },
  stats: {
    overview: (orgId: string, projectId?: string) =>
      ["organizations", orgId, "stats", "overview", { projectId }] as const,
    daily: (orgId: string, days?: number) =>
      ["organizations", orgId, "stats", "daily", days] as const,
    hourly: (orgId: string, hours?: number) =>
      ["organizations", orgId, "stats", "hourly", hours] as const,
    riskAlerts: (orgId: string, projectId?: string, month?: string) =>
      ["organizations", orgId, "stats", "risk_alerts", { projectId, month }] as const,
    dailyByModel: (orgId: string, days: number, projectId?: string) =>
      ["organizations", orgId, "stats", "daily_by_model", { days, projectId }] as const,
    toolOverview: (orgId: string, tool: string) =>
      ["organizations", orgId, "stats", "tools", tool, "overview"] as const,
    toolModels: (orgId: string, tool: string, days?: number) =>
      ["organizations", orgId, "stats", "tools", tool, "models", days] as const,
    toolUsers: (orgId: string, tool: string, days?: number) =>
      ["organizations", orgId, "stats", "tools", tool, "users", days] as const,
    toolDaily: (orgId: string, tool: string, days?: number) =>
      ["organizations", orgId, "stats", "tools", tool, "daily", days] as const,
    toolEventTypes: (orgId: string, tool: string, days?: number) =>
      ["organizations", orgId, "stats", "tools", tool, "event_types", days] as const,
  },
  alerts: {
    all: (orgId: string) => ["organizations", orgId, "alerts"] as const,
  },
  invitations: {
    all: (orgId: string) => ["organizations", orgId, "invitations"] as const,
    detail: (orgId: string, id: string) => ["organizations", orgId, "invitations", id] as const,
    byToken: (token: string) => ["invitations", token] as const,
    check: ["invitations", "check"] as const,
  },
  auditLogs: {
    all: (orgId: string, params?: Record<string, unknown>) =>
      ["organizations", orgId, "audit_logs", params] as const,
  },
  projectAuditLogs: {
    all: (projectId: string, params?: Record<string, unknown>) =>
      ["projects", projectId, "audit_logs", params] as const,
  },
  unifiedAuditLogs: {
    all: (orgId: string, params?: Record<string, unknown>) =>
      ["organizations", orgId, "audit_logs", "unified", params] as const,
  },
  webhookDeliveries: {
    all: (orgId: string) => ["admin", "webhook_deliveries", orgId] as const,
    list: (orgId: string, filters: object) =>
      ["admin", "webhook_deliveries", orgId, "list", filters] as const,
  },
};

// ============================================================================
// User Hooks
// ============================================================================

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user.current,
    queryFn: async () => {
      const response = await api.get<{ data: CurrentUser }>("/users/me");
      return response.data;
    },
  });
}

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; avatar_url?: string }) =>
      api.patch<{ data: CurrentUser }>("/users/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
    },
  });
}

export function useUserOrganizations() {
  return useQuery({
    queryKey: queryKeys.user.organizations,
    queryFn: async () => {
      const response = await api.get<{ data: Organization[] }>("/users/me/organizations");
      return response.data;
    },
  });
}

export function useUpdateUserSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<{ data: { key: string; value: string } }>(`/users/me/settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.settings });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current });
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
      api.post<Organization>("/organizations", data),
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
    queryKey: ["organizations", orgId, "retention_policy"],
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
    mutationFn: ({ orgId, data }: { orgId: string; data: Record<string, string | number | boolean | null> }) =>
      api.patch<{ data: RetentionPolicy }>(`/organizations/${orgId}/retention_policy`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "retention_policy"] });
    },
  });
}

export function useProjectRetentionPolicy(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "retention_policy"],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectRetentionPolicy }>(`/projects/${projectId}/retention_policy`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useUpdateProjectRetentionPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Record<string, string | number | boolean | null> }) =>
      api.patch<{ data: ProjectRetentionPolicy }>(`/projects/${projectId}/retention_policy`, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "retention_policy"] });
    },
  });
}

export function useRetentionPreview(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "retention_preview"],
    queryFn: async () => {
      const response = await api.get<{ data: RetentionPreview }>(`/organizations/${orgId}/retention_preview`);
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useRetentionLogs(orgId: string, page = 1) {
  return useQuery({
    queryKey: ["organizations", orgId, "retention_logs", page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      return api.get<PaginatedResponse<RetentionPurgeLog>>(
        `/organizations/${orgId}/retention_logs?${params.toString()}`
      );
    },
    enabled: !!orgId,
  });
}

// Organization Settings (key-value store)
export function useOrganizationSettings(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "settings"],
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
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "settings"] });
    },
  });
}

export function useDeleteOrganizationSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, key }: { orgId: string; key: string }) =>
      api.delete(`/organizations/${orgId}/settings/${key}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "settings"] });
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
    queryKey: ["projects", projectId, "settings"],
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
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "settings"] });
    },
  });
}

export function useDeleteProjectSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, key }: { projectId: string; key: string }) =>
      api.delete(`/projects/${projectId}/settings/${key}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "settings"] });
    },
  });
}

// ============================================================================
// Organization Members Hooks
// ============================================================================

export function useOrganizationMembers(
  orgId: string,
  options?: { enabled?: boolean }
) {
  const enabled = (options?.enabled ?? true) && !!orgId;
  return useQuery({
    queryKey: queryKeys.members.all(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: OrganizationMember[] }>(`/organizations/${orgId}/members`);
      return response.data;
    },
    enabled,
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
    onMutate: async ({ orgId, memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.members.all(orgId) });
      const previous = queryClient.getQueryData<OrganizationMember[]>(queryKeys.members.all(orgId));
      if (previous) {
        queryClient.setQueryData<OrganizationMember[]>(
          queryKeys.members.all(orgId),
          previous.map((m) => (m.id === memberId ? { ...m, role: role as OrganizationMember["role"] } : m))
        );
      }
      return { previous, orgId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.members.all(context.orgId), context.previous);
      }
    },
    onSettled: (_, __, { orgId }) => {
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
          if (value !== undefined && value !== null && value !== "") {
            searchParams.append(key, String(value));
          }
        });
      }
      const query = searchParams.toString();
      const response = await api.get<PaginatedResponse<ToolEvent>>(
        `/organizations/${orgId}/members/${memberId}/events${query ? `?${query}` : ""}`
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

export interface MemberDashboardStats {
  total_events: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  events_change_percent: number;
  cost_change_percent: number;
  tokens_change_percent: number;
  tool_breakdown: { tool_name: string; event_count: number; cost_usd: number }[];
}

export interface MemberHeatmapEntry {
  date: string;
  count: number;
}

export function useMemberDashboardStats(orgId: string, userId: string, period = "30d") {
  return useQuery({
    queryKey: queryKeys.members.dashboardStats(orgId, userId, period),
    queryFn: async () => {
      const response = await api.get<MemberDashboardStats>(
        `/organizations/${orgId}/members/${userId}/dashboard_stats?period=${period}`
      );
      return response;
    },
    enabled: !!orgId && !!userId,
    staleTime: 60_000,
  });
}

export function useMemberHeatmap(orgId: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.members.heatmap(orgId, userId),
    queryFn: async () => {
      const response = await api.get<MemberHeatmapEntry[]>(
        `/organizations/${orgId}/members/${userId}/stats/heatmap`
      );
      return response;
    },
    enabled: !!orgId && !!userId,
    staleTime: 5 * 60_000,
  });
}

export interface PromptInsightsCallout {
  type: "strength" | "tool" | "opportunity";
  label: string;
  text: string;
}

export interface PromptInsights {
  score: number;
  dimensions: {
    structure: number;
    context: number;
    specificity: number;
  };
  callouts: PromptInsightsCallout[];
}

export function usePromptInsights(orgId: string, userId: string, period = "30d") {
  return useQuery({
    queryKey: queryKeys.members.promptInsights(orgId, userId, period),
    queryFn: async () => {
      const response = await api.get<PromptInsights>(
        `/organizations/${orgId}/members/${userId}/prompt_insights?period=${period}`
      );
      return response;
    },
    enabled: !!orgId && !!userId,
    staleTime: 60_000,
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
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

// ============================================================================
// Favorites Hooks
// ============================================================================

export interface FavoriteProject {
  id: string;
  name: string;
}

export function useFavoriteProjects() {
  return useQuery({
    queryKey: queryKeys.favorites.all(),
    queryFn: async () => {
      const response = await api.get<{ data: FavoriteProject[] }>("/users/me/favorites");
      return response.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favorited }: { id: string; name: string; favorited: boolean }) =>
      favorited
        ? api.delete(`/projects/${id}/favorite`)
        : api.post(`/projects/${id}/favorite`),
    onMutate: async ({ id, name, favorited }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.all() });
      const previous = queryClient.getQueryData<FavoriteProject[]>(queryKeys.favorites.all());
      queryClient.setQueryData<FavoriteProject[]>(queryKeys.favorites.all(), (old = []) =>
        favorited ? old.filter((f) => f.id !== id) : [...old, { id, name }],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.favorites.all(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all() });
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
  previousPeriod?: {
    totalEvents: number;
    totalCost: number;
  };
}

export function useProjectStats(projectId: string, days = 30) {
  return useQuery({
    queryKey: ["projects", projectId, "stats", days],
    queryFn: () => api.get<ProjectStatsResponse>(`/projects/${projectId}/stats?days=${days}`),
    enabled: !!projectId,
  });
}

// Project daily by tool for stacked bar chart
export function useProjectDailyByTool(projectId: string, days = 30) {
  return useQuery({
    queryKey: ["projects", projectId, "stats", "daily_by_tool", days],
    queryFn: () => api.get<DailyByToolResponse>(`/projects/${projectId}/stats/daily_by_tool?days=${days}`),
    enabled: !!projectId,
  });
}

// Project members
interface RawProjectMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  createdById?: string | null;
  // Stats merged after Alba serialisation — snake_case because they bypass transform_keys :lower_camel
  total_events?: number;
  total_cost?: number;
  last_active_at?: string | null;
  cli_connected?: boolean;
}

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  createdById?: string | null;
  totalEvents: number;
  totalCost: number;
  lastActiveAt: string | null;
  cliConnected?: boolean;
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: async () => {
      const response = await api.get<{ data: RawProjectMember[] }>(`/projects/${projectId}/members`);
      return response.data.map((m): ProjectMember => ({
        ...m,
        totalEvents: m.total_events ?? 0,
        totalCost: m.total_cost ?? 0,
        lastActiveAt: m.last_active_at ?? null,
        cliConnected: m.cli_connected,
      }));
    },
    enabled: !!projectId,
  });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; role: string }) =>
      api.post<{ data: ProjectMember }>(`/projects/${projectId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members", "stats"] });
    },
  });
}

export function useUpdateProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch<{ data: ProjectMember }>(`/projects/${projectId}/members/${id}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/projects/${projectId}/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "members"] });
    },
  });
}

export interface ProjectMemberStat {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastEventAt: string | null;
  primaryTool: string | null;
}

// Pass enabled=false for non-project-owners — the API returns 403 for plain members.
export function useProjectMemberStats(projectId: string, days = 30, enabled = true) {
  return useQuery({
    queryKey: ["projects", projectId, "members", "stats", days],
    queryFn: async () => {
      const res = await api.get<{ data: ProjectMemberStat[] }>(
        `/projects/${projectId}/members/stats?days=${days}`
      );
      return res.data;
    },
    enabled: !!projectId && enabled,
  });
}

// Personal settings
export function usePersonalSettings() {
  return useQuery({
    queryKey: ["user", "personal-settings"],
    queryFn: async () => {
      const response = await api.get<{ data: UserPersonalSettings }>("/users/me/personal_settings");
      return response.data;
    },
  });
}

export function useUpdatePersonalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      costThresholdCents?: number | null;
      tokenThreshold?: number | null;
      alertEmail?: boolean;
      alertSlack?: boolean;
    }) =>
      api.patch<{ data: UserPersonalSettings }>("/users/me/personal_settings", {
        personal_settings: {
          cost_threshold_cents: data.costThresholdCents,
          token_threshold: data.tokenThreshold,
          alert_email: data.alertEmail,
          alert_slack: data.alertSlack,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "personal-settings"] });
    },
  });
}

// Notification routes
export function useNotificationRoutes(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "notification_routes"],
    queryFn: async () => {
      const response = await api.get<{ data: NotificationRoute[] }>(
        `/organizations/${orgId}/notification_routes`
      );
      return response.data;
    },
    enabled: !!orgId,
  });
}

export function useCreateNotificationRoute(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      notification_type: NotificationRoute["notificationType"];
      recipient_type: NotificationRoute["recipientType"];
      recipient_role?: MemberRole | null;
      recipient_user_id?: string | null;
      enabled: boolean;
    }) =>
      api.post<{ data: NotificationRoute }>(
        `/organizations/${orgId}/notification_routes`,
        { notification_route: data }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "notification_routes"] });
    },
  });
}

export function useUpdateNotificationRoute(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; enabled?: boolean }) =>
      api.patch<{ data: NotificationRoute }>(
        `/organizations/${orgId}/notification_routes/${id}`,
        { notification_route: data }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "notification_routes"] });
    },
  });
}

export function useDeleteNotificationRoute(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/organizations/${orgId}/notification_routes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "notification_routes"] });
    },
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
    queryKey: ["projects", projectId, "repositories"],
    queryFn: async () => {
      const response = await api.get<{ data: ProjectRepository[] }>(`/projects/${projectId}/repositories`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export interface AvailableRepository {
  externalId: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  alreadyLinked: boolean;
}

export function useAvailableRepos(orgId: string, connectorId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.connectors.availableRepos(orgId, connectorId),
    queryFn: async () => {
      const response = await api.get<{ data: AvailableRepository[] }>(
        `/organizations/${orgId}/connectors/${connectorId}/available_repos`
      );
      return response.data;
    },
    enabled: !!orgId && !!connectorId && enabled,
  });
}

export function useConnectRepo(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      organization_connector_id: string;
      external_id: string;
      name: string;
      full_name: string;
      url: string;
      default_branch: string;
      is_private: boolean;
    }) => api.post<{ data: ProjectRepository }>(`/projects/${projectId}/repositories`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useDisconnectRepo(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repoId: string) => api.delete(`/projects/${projectId}/repositories/${repoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
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
    // POST /sync returns before the Sidekiq job finishes; status stays "testing" until mark_synced!.
    // Poll so /integrations/connected updates when the job completes (or errors).
    refetchInterval: (query) => {
      const data = query.state.data as Connector[] | undefined;
      if (!data?.length) return false;
      return data.some((c) => c.status === "testing") ? 3_000 : false;
    },
  });
}

export function useConnectorHealth(orgId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.connectors.health(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: ConnectorHealthRollup }>(
        `/organizations/${orgId}/connectors/health`
      );
      return response.data;
    },
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useConnectorAuthorizeUrl(orgId: string, provider: string) {
  return useQuery({
    queryKey: ["connectors", "authorize", orgId, provider],
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
      connectorType,
    }: {
      orgId: string;
      code: string;
      connectorType: string;
    }) =>
      api.post<Connector>(`/organizations/${orgId}/connectors/callback`, {
        code,
        connector_type: connectorType,
      }, {
        // Rails sets current_organization from this header only (see ApplicationController#set_current_organization);
        // the :organization_id path segment is not used for org context. Global api.ts also adds the header when
        // currentOrgId is set — this explicit value covers OAuth return paths where OrgContext may not have synced yet.
        headers: {
          "X-Organization-ID": orgId,
        },
      }),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(orgId) });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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

export function useUpdateConnector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      connectorId,
      data,
    }: {
      orgId: string;
      connectorId: string;
      data: Record<string, unknown>;
    }) => api.patch(`/organizations/${orgId}/connectors/${connectorId}`, data),
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
        connector_type: "slack",
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
        connector_type: "slack",
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
      toolName,
      externalUserId,
      externalUsername,
      accessToken,
    }: {
      orgId: string;
      toolName: string;
      externalUserId?: string;
      externalUsername?: string;
      accessToken?: string;
    }) =>
      api.post<{ data: ToolAccount }>(`/organizations/${orgId}/tool_accounts`, {
        tool_name: toolName,
        ...(externalUserId !== undefined && { external_user_id: externalUserId }),
        ...(externalUsername !== undefined && { external_username: externalUsername }),
        ...(accessToken !== undefined && { access_token: accessToken }),
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolAccounts.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.myToolAccounts(orgId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.user.myToolAccounts(orgId) });
    },
  });
}

export function useUpdateToolAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      accountId,
      isActive,
      accessToken,
    }: {
      orgId: string;
      accountId: string;
      isActive?: boolean;
      accessToken?: string;
    }) =>
      api.patch<{ data: ToolAccount }>(`/organizations/${orgId}/tool_accounts/${accountId}`, {
        ...(isActive !== undefined && { is_active: isActive }),
        ...(accessToken !== undefined && { access_token: accessToken }),
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolAccounts.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.myToolAccounts(orgId) });
    },
  });
}

export function useRegenerateIngestToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, accountId }: { orgId: string; accountId: string }) =>
      api.post<{ data: ToolAccount }>(`/organizations/${orgId}/tool_accounts/${accountId}/regenerate_token`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolAccounts.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.myToolAccounts(orgId) });
    },
  });
}

export function useMyToolAccounts(orgId: string) {
  return useQuery({
    queryKey: queryKeys.user.myToolAccounts(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: MyToolAccountMetadata[] }>("/users/me/tool_accounts", {
        headers: { "X-Organization-ID": orgId },
      });
      return response.data;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function useMcpIngestExchange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ toolName, orgId }: { toolName: string; orgId: string }) => {
      const response = await api.post<{ data: McpIngestExchangeData }>(
        "/integrations/mcp/exchange",
        {
          tool_name: toolName,
        },
        {
          headers: { "X-Organization-ID": orgId },
        }
      );
      return response.data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.myToolAccounts(orgId) });
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

export function useEvents(orgId: string, params?: EventsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.events.all(orgId, params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            searchParams.append(key, String(value));
          }
        });
      }
      const query = searchParams.toString();
      return api.get<PaginatedResponse<ToolEvent>>(
        `/organizations/${orgId}/events${query ? `?${query}` : ""}`
      );
    },
    enabled: options?.enabled !== false && !!orgId,
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

export function useExportEvents(orgId: string) {
  const [isExporting, setIsExporting] = useState(false);

  const exportEvents = useCallback(
    async (params: EventsParams & { filename: string }) => {
      if (!orgId) return;
      setIsExporting(true);
      try {
        const { filename, ...filterParams } = params;
        const searchParams = new URLSearchParams();
        Object.entries(filterParams).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") {
            searchParams.append(k, String(v));
          }
        });
        const query = searchParams.toString();
        const endpoint = `/organizations/${orgId}/events/export${query ? `?${query}` : ""}`;
        return await downloadBlob(endpoint, filename, "text/csv", orgId);
      } finally {
        setIsExporting(false);
      }
    },
    [orgId]
  );

  return { exportEvents, isExporting };
}

export function useEventAuditTrail(orgId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.events.auditTrail(orgId, id),
    queryFn: () => api.get<EventAuditEntry[]>(`/organizations/${orgId}/events/${id}/audit_trail`),
    enabled: !!orgId && !!id,
  });
}

export interface EventsSummary {
  totalEvents: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  byTool: Record<string, number>;
  byEventType: Record<string, number>;
  byUser: Record<string, number>;
  timeRange: { start: string | null; end: string | null };
}

export function useEventsSummary(orgId: string) {
  return useQuery({
    queryKey: queryKeys.events.summary(orgId),
    queryFn: async () => {
      const response = await api.get<{ data: EventsSummary }>(`/organizations/${orgId}/events/summary`);
      return response.data;
    },
    enabled: !!orgId,
  });
}

export interface UnattributedEventsParams {
  toolName?: string;
  startDate?: string;
  endDate?: string;
  minConfidence?: number;
}

export function useUnattributedEvents(
  orgId: string,
  params?: UnattributedEventsParams,
  options?: { enabled?: boolean }
) {
  const enabled = (options?.enabled ?? true) && !!orgId;
  return useQuery({
    queryKey: [...queryKeys.events.unattributed(orgId), params] as const,
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params?.toolName) query.set("tool_name", params.toolName);
      if (params?.startDate) query.set("start_date", params.startDate);
      if (params?.endDate) query.set("end_date", params.endDate);
      if (params?.minConfidence != null) query.set("min_confidence", String(params.minConfidence));
      const qs = query.toString();
      const response = await api.get<{ data: ToolEvent[] }>(
        `/organizations/${orgId}/events/unattributed${qs ? `?${qs}` : ""}`
      );
      const rows = response.data;
      return Array.isArray(rows) ? rows : [];
    },
    enabled,
  });
}

export function useAttributeEvent(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      api.post(`/organizations/${orgId}/events/${eventId}/attribute`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.unattributed(orgId) });
    },
  });
}

export function useBulkAttributeEvents(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventIds, userId }: { eventIds: string[]; userId: string }) =>
      api.post(`/organizations/${orgId}/events/attribute_bulk`, { event_ids: eventIds, user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.unattributed(orgId) });
    },
  });
}

// ============================================================================
// Stats Hooks
// ============================================================================

export function useOverviewStats(orgId: string, projectId?: string) {
  return useQuery({
    queryKey: queryKeys.stats.overview(orgId, projectId),
    queryFn: () => {
      const params = projectId ? `?project_id=${projectId}` : "";
      return api.get<OverviewStats>(`/organizations/${orgId}/stats/overview${params}`);
    },
    enabled: !!orgId,
    refetchInterval: 30000,
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
    queryKey: ["organizations", orgId, "stats", "heatmap"],
    queryFn: () => api.get<ActivityHeatmapData[]>(`/organizations/${orgId}/stats/heatmap`),
    enabled: !!orgId,
  });
}

export interface DailyToolData {
  date: string;
  [toolName: string]: string | number;
}

export interface DailyByToolResponse {
  data: DailyToolData[];
  tools: string[];
}

export interface DailyByToolOpts {
  days?: number;
  period?: "day" | "week";
  month?: string;
  projectId?: string;
}

export function useDailyByTool(orgId: string, opts: DailyByToolOpts | number = {}) {
  const normalized: DailyByToolOpts = typeof opts === "number" ? { days: opts } : opts;
  const { days = 30, period, month, projectId } = normalized;

  return useQuery({
    queryKey: ["organizations", orgId, "stats", "daily_by_tool", normalized],
    queryFn: () => {
      const p = new URLSearchParams();
      if (!month) p.set("days", String(days));
      if (period) p.set("period", period);
      if (month) p.set("month", month);
      if (projectId) p.set("project_id", projectId);
      return api.get<DailyByToolResponse>(`/organizations/${orgId}/stats/daily_by_tool?${p}`);
    },
    enabled: !!orgId,
  });
}

export interface RiskAlertRow {
  toolName: string;
  eventCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export function useOrgRiskAlerts(orgId: string, projectId?: string, month?: string) {
  return useQuery({
    queryKey: queryKeys.stats.riskAlerts(orgId, projectId, month),
    queryFn: () => {
      const p = new URLSearchParams();
      if (projectId) p.set("project_id", projectId);
      if (month) p.set("month", month);
      const qs = p.toString();
      return api.get<RiskAlertRow[]>(`/organizations/${orgId}/stats/risk_alerts${qs ? `?${qs}` : ""}`);
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export interface DailyModelData {
  date: string;
  [modelName: string]: string | number;
}

export interface DailyByModelResponse {
  data: DailyModelData[];
  models: string[];
}

export function useDailyByModel(orgId: string, opts: DailyByToolOpts | number = {}) {
  const normalized: DailyByToolOpts = typeof opts === "number" ? { days: opts } : opts;
  const { days = 30, period, month, projectId } = normalized;

  return useQuery({
    queryKey: queryKeys.stats.dailyByModel(orgId, days, projectId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (!month) p.set("days", String(days));
      if (period) p.set("period", period);
      if (month) p.set("month", month);
      if (projectId) p.set("project_id", projectId);
      return api.get<DailyByModelResponse>(`/organizations/${orgId}/stats/daily_by_model?${p}`);
    },
    enabled: !!orgId,
  });
}

// ============================================================================
// Tool Analytics Hooks (shared by Cursor & OpenRouter pages)
// ============================================================================

export function useToolOverview(orgId: string, tool: string) {
  return useQuery({
    queryKey: queryKeys.stats.toolOverview(orgId, tool),
    queryFn: () =>
      api.get<ToolOverviewStats>(`/organizations/${orgId}/stats/tools/${tool}/overview`),
    enabled: !!orgId && !!tool,
    refetchInterval: 30000,
  });
}

export function useToolModels(orgId: string, tool: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.toolModels(orgId, tool, days),
    queryFn: () =>
      api.get<ToolModelsResponse>(`/organizations/${orgId}/stats/tools/${tool}/models?days=${days}`),
    enabled: !!orgId && !!tool,
  });
}

export function useToolUsers(orgId: string, tool: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.toolUsers(orgId, tool, days),
    queryFn: () =>
      api.get<ToolUsersResponse>(`/organizations/${orgId}/stats/tools/${tool}/users?days=${days}`),
    enabled: !!orgId && !!tool,
  });
}

export function useToolDaily(orgId: string, tool: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.toolDaily(orgId, tool, days),
    queryFn: () =>
      api.get<ToolDailyResponse>(`/organizations/${orgId}/stats/tools/${tool}/daily?days=${days}`),
    enabled: !!orgId && !!tool,
  });
}

export function useToolEventTypes(orgId: string, tool: string, days = 30) {
  return useQuery({
    queryKey: queryKeys.stats.toolEventTypes(orgId, tool, days),
    queryFn: () =>
      api.get<ToolEventTypesResponse>(
        `/organizations/${orgId}/stats/tools/${tool}/event_types?days=${days}`
      ),
    enabled: !!orgId && !!tool,
  });
}

export function useConnectorSyncStatus(orgId: string, connectorId: string) {
  return useQuery({
    queryKey: queryKeys.connectors.syncStatus(orgId, connectorId),
    queryFn: () =>
      api.get<ConnectorSyncStatus>(
        `/organizations/${orgId}/connectors/${connectorId}/sync_status`
      ),
    enabled: !!orgId && !!connectorId,
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
      const params = status ? `?status=${status}` : "";
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
      const response = await api.get<{ data: InvitationPublic[] }>("/invitations/check");
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

export interface UnifiedAuditLogFilters {
  page?: number;
  per_page?: number;
  scope?: "organization" | "project" | "admin";
  severity?: "info" | "warning" | "critical";
  outcome?: "success" | "failure";
  from_date?: string;
  to_date?: string;
  actor_id?: string;
}

export function useOrganizationAuditLogs(orgId: string, filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs.all(orgId, filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set("page", String(filters.page));
      if (filters.per_page) params.set("per_page", String(filters.per_page));
      if (filters.actor_id) params.set("actor_id", filters.actor_id);
      if (filters.log_action) params.set("log_action", filters.log_action);
      if (filters.resource_type) params.set("resource_type", filters.resource_type);
      if (filters.from_date) params.set("from_date", filters.from_date);
      if (filters.to_date) params.set("to_date", filters.to_date);
      const query = params.toString();
      return api.get<PaginatedResponse<OrganizationAuditLog>>(
        `/organizations/${orgId}/audit_logs${query ? `?${query}` : ""}`
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
      if (filters.page) params.set("page", String(filters.page));
      if (filters.per_page) params.set("per_page", String(filters.per_page));
      if (filters.actor_id) params.set("actor_id", filters.actor_id);
      if (filters.log_action) params.set("log_action", filters.log_action);
      if (filters.resource_type) params.set("resource_type", filters.resource_type);
      if (filters.from_date) params.set("from_date", filters.from_date);
      if (filters.to_date) params.set("to_date", filters.to_date);
      const query = params.toString();
      return api.get<PaginatedResponse<ProjectAuditLog>>(
        `/projects/${projectId}/audit_logs${query ? `?${query}` : ""}`
      );
    },
    enabled: !!projectId,
  });
}

export function useUnifiedAuditLogs(orgId: string, filters: UnifiedAuditLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.unifiedAuditLogs.all(orgId, filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set("page", String(filters.page));
      if (filters.per_page) params.set("per_page", String(filters.per_page));
      if (filters.scope) params.set("scope", filters.scope);
      if (filters.severity) params.set("severity", filters.severity);
      if (filters.outcome) params.set("outcome", filters.outcome);
      if (filters.from_date) params.set("from_date", filters.from_date);
      if (filters.to_date) params.set("to_date", filters.to_date);
      if (filters.actor_id) params.set("actor_id", filters.actor_id);
      const query = params.toString();
      return api.get<{ data: UnifiedAuditLog[]; meta: UnifiedPaginatedMeta }>(
        `/organizations/${orgId}/audit_logs/unified${query ? `?${query}` : ""}`
      );
    },
    enabled: !!orgId,
  });
}

export function useExportUnifiedAuditLogs(orgId: string) {
  const [isExporting, setIsExporting] = useState(false);

  const exportLogs = useCallback(
    async (filters: Omit<UnifiedAuditLogFilters, "page" | "per_page">) => {
      if (!orgId) return;
      setIsExporting(true);
      try {
        const searchParams = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") searchParams.append(k, String(v));
        });
        const query = searchParams.toString();
        const endpoint = `/organizations/${orgId}/audit_logs/unified/export${query ? `?${query}` : ""}`;
        const filename = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
        return await downloadBlob(endpoint, filename, "text/csv", orgId);
      } finally {
        setIsExporting(false);
      }
    },
    [orgId]
  );

  return { exportLogs, isExporting };
}

// ============================================================================
// Issue Provider Hooks
// ============================================================================

export interface IssueFilters {
  status_category?: string;
  type?: string;
  assignee?: string;
  page?: number;
}

export function useProjectIssues(projectId: string, filters?: IssueFilters) {
  return useQuery({
    queryKey: queryKeys.issues.all(projectId, filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status_category) params.set("status_category", filters.status_category);
      if (filters?.type) params.set("type", filters.type);
      if (filters?.assignee) params.set("assignee", filters.assignee);
      if (filters?.page) params.set("page", String(filters.page));
      const query = params.toString();
      return api.get<PaginatedResponse<Issue>>(
        `/projects/${projectId}/issues${query ? `?${query}` : ""}`
      );
    },
    enabled: !!projectId,
  });
}

// GET /api/v1/organizations/:orgId/connectors/:connectorId/available_projects
export function useAvailableJiraProjects(orgId: string, connectorId: string) {
  return useQuery({
    queryKey: queryKeys.connectors.availableProjects(orgId, connectorId),
    queryFn: async () => {
      const response = await api.get<{ data: JiraProject[] }>(
        `/organizations/${orgId}/connectors/${connectorId}/available_projects`
      );
      return response.data;
    },
    enabled: !!orgId && !!connectorId,
  });
}

export function useAvailableLinearProjects(orgId: string, connectorId: string) {
  return useQuery({
    queryKey: queryKeys.connectors.availableProjects(orgId, connectorId),
    queryFn: async () => {
      const response = await api.get<{ data: IssueProviderProject[] }>(
        `/organizations/${orgId}/connectors/${connectorId}/available_projects`
      );
      return response.data;
    },
    enabled: !!orgId && !!connectorId,
  });
}

// POST /api/v1/projects/:projectId/sync_issues
// Runs synchronously — only invalidate after the server confirms completion.
export function useSyncProjectIssues(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/sync_issues`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}

// POST /api/v1/projects/:projectId/link_jira
export function useLinkJira(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { connector_id: string; jira_project_key: string }) =>
      api.post<{ data: { linked: boolean } }>(`/projects/${projectId}/link_jira`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}

export function useLinkLinear(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { connector_id: string; linear_project_id: string; linear_project_name: string }) =>
      api.post<{ data: { linked: boolean } }>(`/projects/${projectId}/link_linear`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}

// Model Pricing
export function useModelPricing(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "model_pricing"],
    queryFn: () => api.get<ModelPricingResponse>(`/organizations/${orgId}/model_pricing`),
    enabled: !!orgId,
  });
}

// Model Pricing Overrides
export function useModelPricingOverrides(orgId: string) {
  return useQuery({
    queryKey: ["organizations", orgId, "model_pricing_overrides"],
    queryFn: () =>
      api.get<ModelPricingOverridesResponse>(`/organizations/${orgId}/model_pricing/overrides`),
    enabled: !!orgId,
  });
}

function toOverridePayload(input: ModelPricingOverrideInput) {
  return {
    model_pattern: input.modelPattern,
    input_per_mtok: input.inputPerMtok,
    output_per_mtok: input.outputPerMtok,
  };
}

export function useCreateModelPricingOverride(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ModelPricingOverrideInput) =>
      api.post<{ data: ModelPricingOverride }>(
        `/organizations/${orgId}/model_pricing/overrides`,
        toOverridePayload(input),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "model_pricing_overrides"],
      });
    },
  });
}

export function useUpdateModelPricingOverride(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ModelPricingOverrideInput & { id: string }) =>
      api.put<{ data: ModelPricingOverride }>(
        `/organizations/${orgId}/model_pricing/overrides/${id}`,
        toOverridePayload(input),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "model_pricing_overrides"],
      });
    },
  });
}

// AIX-206 ticket naming aliases
export { useRetentionPolicy as useOrgPolicy, useUpdateRetentionPolicy as useUpdateOrgPolicy };
export { useProjectMembers as useProjectMemberships };

export function useDeleteModelPricingOverride(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/organizations/${orgId}/model_pricing/overrides/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "model_pricing_overrides"],
      });
    },
  });
}
