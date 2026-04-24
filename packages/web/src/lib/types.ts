/**
 * API Response Types
 *
 * These types match the Rails API responses.
 */

// User types
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "admin" | "member" | "viewer";
  super_admin: boolean;
  created_at: string;
  updated_at: string;
  lastSignInAt: string | null;
}

export interface CurrentUser extends User {
  organizations: Organization[];
  settings: Record<string, string>;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url: string | null;
  is_active?: boolean;
  user_role?: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface OrganizationWithStats extends Organization {
  member_count: number;
  project_count: number;
  connector_count: number;
}

// Organization member types
export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  user: User;
  created_at: string;
  updated_at: string;
  total_tokens?: number;
  last_active_at?: string | null;
}

// Project types
export interface Project {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  organizationId?: string | null;
  repository_url: string | null;
  repositoryUrl: string | null;
  git_remote_url: string | null;
  gitRemoteUrl: string | null;
  is_active: boolean;
  isActive?: boolean;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
}

export interface ProjectWithStats extends Project {
  event_count: number;
  eventCount?: number;
  total_cost_usd: number;
  totalCostUsd?: number;
  last_event_at: string | null;
  lastEventAt?: string | null;
  connectors: { id: string; provider: string }[];
  jiraProjectKey?: string | null;
  jiraConnectorId?: string | null;
}

// Connector types
export type ConnectorProvider = "github" | "gitlab" | "bitbucket" | "jira" | "linear" | "anthropic" | "openai" | "openrouter" | "gemini" | "slack";
export type ConnectorStatus = "connected" | "testing" | "error" | "disconnected";

export interface Connector {
  id: string;
  organizationId?: string;
  organization_id?: string;
  connectorType: ConnectorProvider;
  connector_type?: ConnectorProvider;
  isActive: boolean;
  is_active?: boolean;
  status: ConnectorStatus;
  externalAccountId?: string | null;
  external_account_id?: string | null;
  externalAccountName?: string | null;
  external_account_name?: string | null;
  lastSyncAt?: string | null;
  last_sync_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
  tokenExpired?: boolean;
  token_expired?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

// Project connector types
export type ProjectConnectorProvider = "anthropic" | "openai" | "openrouter" | "gemini" | "slack";

export interface ProjectConnector {
  id: string;
  projectId?: string;
  project_id?: string;
  connectorType: ProjectConnectorProvider;
  connector_type?: ProjectConnectorProvider;
  isActive: boolean;
  is_active?: boolean;
  status: ConnectorStatus;
  externalAccountId?: string | null;
  external_account_id?: string | null;
  externalAccountName?: string | null;
  external_account_name?: string | null;
  lastSyncAt?: string | null;
  last_sync_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
  tokenExpired?: boolean;
  token_expired?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

// Tool account types
export interface ToolAccount {
  id: string;
  toolName: string;
  isActive: boolean;
  externalUserId: string | null;
  externalUsername: string | null;
  externalEmail: string | null;
  organizationMembershipId: string;
  tokenExpired: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  ingestToken?: string; // one-time, only present immediately after create/regenerate
}

// Event types
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type EventType = "completion" | "prompt" | "chat" | "edit" | "generation";

export interface ToolEvent {
  id: string;
  toolName: string;
  eventType: EventType;
  attribution: string;
  riskLevel: RiskLevel;
  costUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  securityFindings: SecurityFinding[];
  user: { id: string; email: string; name: string | null } | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  occurredAt: string;
  // Detail-only fields (returned by the show endpoint, not the list endpoint)
  sanitizedContent?: string | null;
  metadata?: Record<string, unknown> | null;
  durationMs?: number | null;
  auditLog?: AuditLog | null;
}

export interface SecurityFinding {
  type: string;
  severity: RiskLevel;
  description: string;
  location: { start: number; end: number } | null;
}

export interface EventAuditEntry {
  id: string;
  action: string;
  actor: { id: string; email: string; name: string | null } | null;
  changes: Record<string, unknown>;
  created_at: string;
}

// Stats types
export interface OverviewStats {
  total_events: number;
  total_cost_usd: number;
  events_today: number;
  cost_today_usd: number;
  active_users: number;
  high_risk_events: number;
  events_change_percent: number;
  cost_change_percent: number;
  // Token metrics
  total_tokens_in?: number;
  total_tokens_out?: number;
  total_tokens?: number;
  tokens_today?: number;
}

export interface DailyStats {
  date: string;
  event_count: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export interface HourlyStats {
  hour: string;
  event_count: number;
  cost_usd: number;
}

export interface ToolUsageStats {
  tool_name: string;
  event_count: number;
  cost_usd: number;
  percentage: number;
}

// Alert types
export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface Alert {
  id: string;
  organization_id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// Audit log types (shared shape — both serializers output identical JSON)
export interface AuditLog {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  trackedChanges: Record<string, unknown>;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; email: string; name: string | null } | null;
}

export type OrganizationAuditLog = AuditLog;
export type ProjectAuditLog = AuditLog;

// Pagination types
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

// Retention policy types — values match backend model constants
export type RawEventTtl = "6_hours" | "12_hours" | "24_hours" | "48_hours" | "72_hours";
export type ToolEventsRetention = "30_days" | "60_days" | "90_days" | "180_days" | "365_days" | "730_days";
export type HourlyAggregateRetention = "90_days" | "180_days" | "365_days" | "730_days";
export type DailyAggregateRetention = "365_days" | "730_days" | "1095_days" | "forever";

export interface RetentionPolicy {
  rawEventTtl: RawEventTtl;
  toolEventsRetention: ToolEventsRetention;
  hourlyAggregateRetention: HourlyAggregateRetention;
  dailyAggregateRetention: DailyAggregateRetention;
}

export interface ProjectRetentionPolicy {
  id: string;
  projectId: string;
  rawEventTtl: RawEventTtl;
  toolEventsRetention: ToolEventsRetention;
  hourlyAggregateRetention: HourlyAggregateRetention;
  dailyAggregateRetention: DailyAggregateRetention;
  retentionReason?: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

// Invitation types
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationPublic {
  id: string;
  role: MemberRole;
  status: InvitationStatus;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  invitedByName: string;
  expired: boolean;
  expiresAt: string;
}

// Jira issue types
export interface Issue {
  id: string;
  key: string;
  summary: string;
  status?: string;
  statusCategory?: string;
  issueType?: string;
  priority?: string;
  assigneeName?: string;
  assigneeId?: string;
  reporterName?: string;
  jiraProjectKey: string;
  dueDate?: string;
  labels?: string[];
  externalCreatedAt?: string;
  externalUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JiraProject {
  externalId: string;
  key: string;
  name: string;
  avatarUrl?: string;
}

// Tool analytics types (shared by Cursor & OpenRouter pages)
export interface ToolOverviewStats {
  tool: string;
  total_events: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  active_users: number;
  events_change_pct: number;
  cost_change_pct: number;
}

export interface ToolModelStat {
  name: string;
  eventCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  price_per_million_input: number | null;
  price_per_million_output: number | null;
}

export interface ToolUserStat {
  userId: string;
  name: string;
  email: string;
  eventCount: number;
  totalTokens: number;
  costUsd: number;
}

export interface ToolDailyPoint {
  date: string;
  eventCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ToolEventTypeStat {
  name: string;
  eventCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ToolModelsResponse {
  tool: string;
  timeRange: { start: string; end: string };
  models: ToolModelStat[];
}

export interface ToolUsersResponse {
  tool: string;
  timeRange: { start: string; end: string };
  users: ToolUserStat[];
}

export interface ToolDailyResponse {
  tool: string;
  timeRange: { start: string; end: string };
  daily: ToolDailyPoint[];
}

export interface ToolEventTypesResponse {
  tool: string;
  timeRange: { start: string; end: string };
  eventTypes: ToolEventTypeStat[];
}

export interface ConnectorSyncStatus {
  connector_type: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  total_events: number;
}
