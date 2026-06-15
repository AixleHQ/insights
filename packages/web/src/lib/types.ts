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
  role: "owner" | "member" | "viewer";
  /** Platform-wide admin (API key `global_admin`, Alba camelCase `globalAdmin`). */
  globalAdmin?: boolean;
  /** Alternate naming used in some mocks / legacy code paths. */
  super_admin?: boolean;
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
  /** API JSON uses camelCase (`userId`). */
  userId?: string;
  user_id?: string;
  organization_id: string;
  role: "owner" | "member" | "viewer";
  user: User;
  createdAt?: string;
  updatedAt?: string;
  total_tokens?: number;
  total_events?: number;
  total_cost?: number;
  last_active_at?: string | null;
  cli_connected?: boolean;
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
  linearProjectId?: string | null;
  linearProjectName?: string | null;
  linearConnectorId?: string | null;
  sourceControlSummary?: SourceControlSummary[];
  issueThroughputSummary?: IssueThroughputSummary[];
}

export interface SourceControlSummary {
  provider: string;
  repositoryCount: number;
  commitCount: number;
  reviewCount: number;
  pipelineCount: number;
  lastActivityAt: string | null;
  lastSyncAt: string | null;
}

export interface IssueThroughputSummary {
  provider: string;
  issueCount: number;
  completedCount: number;
  stateChangeCount: number;
  cycleCount: number;
  lastActivityAt: string | null;
  lastSyncAt: string | null;
}

// Connector types
export type ConnectorProvider = "github" | "gitlab" | "bitbucket" | "jira" | "linear" | "anthropic" | "openai" | "openrouter" | "gemini" | "slack" | "github_copilot";
export type ConnectorStatus = "connected" | "testing" | "error" | "disconnected";
export type ConnectorScope = "org" | "project" | "persona";

export interface Connector {
  id: string;
  organizationId?: string;
  organization_id?: string;
  connectorType: ConnectorProvider;
  connector_type?: ConnectorProvider;
  isActive: boolean;
  is_active?: boolean;
  status: ConnectorStatus;
  scope: ConnectorScope;
  label?: string | null;
  externalAccountId?: string | null;
  external_account_id?: string | null;
  externalAccountName?: string | null;
  external_account_name?: string | null;
  lastSyncAt?: string | null;
  last_sync_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
  repositoryCount?: number;
  repository_count?: number;
  syncedEventCount?: number;
  synced_event_count?: number;
  lastEventAt?: string | null;
  last_event_at?: string | null;
  tokenExpired?: boolean;
  token_expired?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  // GitHub Copilot-specific fields (camelCase only — serialized by Alba with transform_keys :lower_camel)
  seatCount?: number | null;
  activeUsersCount?: number | null;
  copilotConnector?: boolean;
  config?: Record<string, unknown>;
  // Webhook fields (OpenRouter-specific)
  webhookActive?: boolean;
  webhookToken?: string;
  webhookSecretSet?: boolean;
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
  scope: ConnectorScope;
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
  connectionState: "inactive" | "active" | "waiting_for_connection";
  externalUserId: string | null;
  externalUsername: string | null;
  externalEmail: string | null;
  organizationMembershipId: string;
  tokenExpired: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  scope: ConnectorScope;
  ingestToken?: string; // one-time, only present immediately after create/regenerate
}

/** Current user's ingest tool rows from GET /users/me/tool_accounts (no persisted token). */
export interface MyToolAccountMetadata {
  id: string;
  toolName: string;
  displayName: string;
  connectionState: "inactive" | "active" | "waiting_for_connection";
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/** Response body `data` from POST /integrations/mcp/exchange (subset used by Settings). */
export interface McpIngestExchangeData {
  ingestHost: string;
  organizationId: string;
  ingestToken?: string;
  toolName?: string;
  accounts?: Record<string, { ingestToken: string }>;
}

// Event types
export const RISK_LEVELS = ["none", "low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type EventType =
  | "chat"
  | "completion"
  | "edit"
  | "commit"
  | "review"
  | "test"
  | "debug"
  | "refactor"
  | "documentation"
  | "other"
  | "issue"
  | "comment"
  | "sprint"
  | "tool_use";

export interface ToolEvent {
  id: string;
  toolName: string;
  eventType: EventType;
  attribution: string;
  riskLevel: RiskLevel;
  costUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  // TODO: align list and detail serialisers to use the same token field names
  tokensIn?: number | null;
  tokensOut?: number | null;
  tokensTotal?: number | null;
  model: string | null;
  securityFindings: SecurityFinding[];
  user: { id: string; email: string; name: string | null; avatarUrl?: string | null } | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  occurredAt: string;
  correlationMethod?: string | null;
  correlationConfidence?: number | null;
  suggestedUser?: { id: string; email: string; name: string | null; avatarUrl?: string | null } | null;
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
  risk_alerts: number;
  events_change_percent: number | null;
  cost_change_percent: number | null;
  // Token metrics
  total_tokens_in?: number;
  total_tokens_out?: number;
  total_tokens?: number;
  tokens_today?: number;
}

// Discriminated union for the dashboard period selector.
// type: "month" = a specific calendar month (value = "YYYY-MM")
// type: "all_time" = unbounded, all available history
export type DashboardPeriod =
  | { type: "month"; value: string }
  | { type: "all_time" };

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
  triggered_by?: string;
  project_name?: string;
  project_id?: string;
  event_id?: string;
  notification_status?: "sent" | "failed" | "pending";
}

// Audit log types (shared shape — both serializers output identical JSON)
export interface AuditLog {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  /** Absent for project-admin callers (non-org-admin); present for org admins and global admins */
  trackedChanges?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  /** Absent for project-admin callers (non-org-admin); present for org admins and global admins */
  ipAddress?: string | null;
  createdAt: string;
  actor: { id: string; email: string; name: string | null } | null;
}

export type OrganizationAuditLog = AuditLog;
export type ProjectAuditLog = AuditLog;

export interface UnifiedAuditLog extends AuditLog {
  scope: "organization" | "project" | "admin";
  severity: "info" | "warning" | "critical" | null;
  outcome: "success" | "failure" | null;
  userAgent?: string | null;
}

export interface UnifiedPaginatedMeta {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
  truncated: boolean;
}

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
  costThresholdCents: number | null;
  tokenThreshold: number | null;
  alertEnabled: boolean;
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
  costThresholdCents: number | null;
  tokenThreshold: number | null;
  alertEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPersonalSettings {
  id: string | null;
  costThresholdCents: number | null;
  tokenThreshold: number | null;
  alertEmail: boolean;
  alertSlack: boolean;
}

export interface NotificationRoute {
  id: string;
  organizationId: string;
  notificationType: "cost_alert" | "token_alert" | "retention_warning" | "risk_alert";
  recipientType: "role" | "user";
  recipientRole: MemberRole | null;
  recipientUserId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionPreview {
  cutoffDate: string | null;
  estimatedRecords: number | null;
}

export type RetentionPurgeStatus = "success" | "partial" | "failed";
export type RetentionPolicyType = "org" | "project";

export interface RetentionPurgeLog {
  id: number;
  organizationId: string;
  projectId: string | null;
  retentionPolicyType: RetentionPolicyType;
  retentionDaysApplied: number;
  cutoffTimestamp: string;
  recordsDeleted: number;
  jobRunAt: string;
  status: RetentionPurgeStatus;
  errorMessage: string | null;
  createdAt: string;
}

// Invitation types
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type MemberRole = "owner" | "member" | "viewer";

export interface Invitation {
  id: string;
  token: string;
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

export interface IssueProviderProject {
  externalId: string;
  key?: string;
  name: string;
  avatarUrl?: string;
  state?: string;
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
  provider?: string | null;
  model?: string | null;
  displayName?: string;
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

export interface ActiveUsersResponse {
  active_users: number;
  timeRange: { start: string; end: string };
}

export interface ToolDailyResponse {
  tool: string;
  timeRange: { start: string; end: string };
  period: "day" | "week" | "month";
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

export interface ConnectorHealthStats {
  id: string;
  connector_type: string;
  status: ConnectorStatus;
  last_sync_at: string | null;
  last_error: string | null;
  success_rate_7d: number | null;
  avg_sync_duration_ms_7d: number | null;
}

export interface ConnectorHealthSummary {
  total: number;
  connected: number;
  testing: number;
  error: number;
  disconnected: number;
}

export interface ConnectorHealthRollup {
  summary: ConnectorHealthSummary;
  connectors: ConnectorHealthStats[];
}

export interface PricingEntry {
  name: string;
  input_per_mtok: number;
  output_per_mtok: number;
}

export interface ModelPricingResponse {
  models: PricingEntry[];
  tools: PricingEntry[];
}

export interface ModelPricingOverride {
  id: string;
  modelPattern: string;
  inputPerMtok: number;
  outputPerMtok: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPricingOverrideInput {
  modelPattern: string;
  inputPerMtok: number;
  outputPerMtok: number;
}

export interface ModelPricingOverridesResponse {
  data: ModelPricingOverride[];
}
