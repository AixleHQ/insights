# DB90 Application Architecture

This document provides comprehensive Mermaid diagrams documenting the DB90 developer tools dashboard architecture.

**Tech Stack:**
- **Frontend:** Vite + React SPA + shadcn/ui + Tailwind CSS
- **Backend:** Ruby on Rails API
- **Background Jobs:** Sidekiq + Redis
- **Workflow Orchestration:** Temporal (durable workflows)
- **Database:** PostgreSQL + TimescaleDB (time-series extension)
- **Object Storage:** MinIO (S3-compatible, for raw event quarantine)
- **Identity:** Keycloak (OIDC)
- **Infrastructure:** Docker Compose

---

## 1. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ OrganizationMembership : "belongs to"
    User ||--o{ ProjectMembership : "assigned to"
    User ||--o{ Project : "owns (personal)"
    User ||--o{ UserSetting : "has"
    User ||--o{ ToolEvent : "generates"

    Organization ||--o{ OrganizationMembership : "has members"
    Organization ||--o{ Project : "owns"
    Organization ||--o{ OrganizationSetting : "has"
    Organization ||--|| OrganizationRetentionPolicy : "has"
    Organization ||--o{ OrganizationConnector : "has"

    OrganizationMembership ||--o{ UserToolAccount : "has"

    Project ||--o{ ProjectMembership : "has members"
    Project ||--o{ Repository : "contains"
    Project ||--o{ ToolEvent : "has"
    Project ||--o{ ProjectSetting : "has"

    Repository ||--o{ ToolEvent : "has"

    User {
        uuid id PK
        string keycloak_sub UK
        string email UK
        string name
        string avatar_url
        boolean global_admin "default: false"
        datetime created_at
        datetime updated_at
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        string description
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    OrganizationMembership {
        uuid id PK
        uuid user_id FK
        uuid organization_id FK
        string role "MemberRole enum"
        datetime created_at
        datetime updated_at
    }

    OrganizationSetting {
        uuid id PK
        uuid organization_id FK
        string key
        jsonb value
        datetime created_at
        datetime updated_at
    }

    OrganizationRetentionPolicy {
        uuid id PK
        uuid organization_id FK "unique - one per org"
        string raw_event_ttl "RawEventTtl enum - default 24_hours"
        string tool_events_retention "ToolEventsRetention enum - default 90_days"
        string hourly_aggregate_retention "HourlyAggregateRetention enum - default 365_days"
        string daily_aggregate_retention "DailyAggregateRetention enum - default forever"
        string retention_reason "compliance note"
        uuid updated_by_id FK
        datetime created_at
        datetime updated_at
    }

    OrganizationConnector {
        uuid id PK
        uuid organization_id FK
        string connector_type "ConnectorType enum"
        string external_org_id
        string external_org_name
        string external_account_id
        string external_account_name
        string access_token
        string refresh_token
        datetime token_expires_at
        text scopes "array of strings"
        string webhook_secret
        jsonb config
        boolean is_active
        datetime last_sync_at
        string last_error
        datetime created_at
        datetime updated_at
    }

    UserToolAccount {
        uuid id PK
        uuid organization_membership_id FK
        string tool_name "ToolName enum"
        string external_user_id
        string external_username
        string external_email
        string external_account_id
        string external_account_name
        string access_token
        string refresh_token
        datetime token_expires_at
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    Project {
        uuid id PK
        uuid organization_id FK "nullable"
        uuid owner_id FK "nullable - for personal projects"
        string name
        string slug
        string description
        string repository_url
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    ProjectMembership {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string role "MemberRole enum"
        datetime created_at
        datetime updated_at
    }

    ProjectSetting {
        uuid id PK
        uuid project_id FK
        string key
        jsonb value
        datetime created_at
        datetime updated_at
    }

    UserSetting {
        uuid id PK
        uuid user_id FK
        string key
        jsonb value
        datetime created_at
        datetime updated_at
    }

    Repository {
        uuid id PK
        uuid project_id FK
        uuid organization_connector_id FK
        string external_id
        string name
        string full_name
        string url
        string clone_url
        string html_url
        string default_branch
        text description
        boolean is_private
        datetime last_sync_at
        datetime created_at
        datetime updated_at
    }

    ToolEvent {
        uuid id PK
        uuid user_id FK
        uuid organization_id FK
        uuid project_id FK
        uuid repository_id FK
        string tool_name "ToolName enum"
        string event_type "EventType enum"
        string model
        integer tokens_in
        integer tokens_out
        integer tokens_total
        decimal cost_usd
        jsonb metadata
        datetime occurred_at "partition key"
        datetime created_at
    }

    HourlyTokenUsage {
        datetime bucket PK "time_bucket"
        uuid organization_id
        uuid user_id
        string tool_name "ToolName enum"
        string model
        bigint tokens_in
        bigint tokens_out
        bigint tokens_total
        decimal cost_usd
        bigint event_count
    }

    DailyTokenUsage {
        datetime bucket PK "time_bucket"
        uuid organization_id
        uuid user_id
        string tool_name "ToolName enum"
        string model
        bigint tokens_in
        bigint tokens_out
        bigint tokens_total
        decimal cost_usd
        bigint event_count
    }

    AuditLog {
        uuid id PK
        uuid tool_event_id FK "nullable - linked after sanitization"
        string raw_event_key "MinIO object key"
        uuid organization_id FK
        text classification_labels "array of strings"
        string risk_level "RiskLevel enum"
        decimal confidence_score
        text sanitization_actions "array of strings"
        uuid policy_version_id FK
        string temporal_workflow_id
        jsonb metadata
        datetime created_at
    }

    AdminAuditLog {
        uuid id PK
        uuid admin_user_id FK "global admin who performed action"
        string action "controller#action"
        string resource_type "e.g. Organization, User"
        uuid resource_id FK "nullable"
        string ip_address
        string user_agent
        jsonb changes "before/after diff"
        jsonb metadata
        datetime created_at
    }

    SanitizationPolicy {
        uuid id PK
        integer version
        string name
        text description
        string pattern
        string replacement
        boolean is_global "default: false"
        integer priority "default: 0"
        jsonb classification_rules
        jsonb sanitization_rules
        boolean is_active
        datetime effective_at
        datetime created_at
        datetime updated_at
    }

    ToolEvent ||--o| AuditLog : "audit trail"
    ToolEvent }|--|| HourlyTokenUsage : "aggregated to"
    HourlyTokenUsage }|--|| DailyTokenUsage : "rolled up to"
    SanitizationPolicy ||--o{ AuditLog : "applied by"
    User ||--o{ AdminAuditLog : "performs (global admin)"
```

### Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA STORAGE OVERVIEW                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MinIO (S3-compatible) - Raw Event Quarantine                    │   │
│  │  Bucket: raw-events                                              │   │
│  │  • Encrypted payloads (AES-256-GCM)                              │   │
│  │  • Lifecycle: CONFIGURABLE per org (default: 24h)                │   │
│  │  • Accessed only by Temporal workers                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL + TimescaleDB                                        │   │
│  │                                                                   │   │
│  │  Schema: public (relational data)                                │   │
│  │  ├── users, organizations, projects, repositories                │   │
│  │  ├── organization_connectors, user_tool_accounts                 │   │
│  │  ├── organization_retention_policies                             │   │
│  │  ├── audit_logs, admin_audit_logs, sanitization_policies          │   │
│  │  └── *_settings, *_memberships                                   │   │
│  │                                                                   │   │
│  │  Schema: timeseries (TimescaleDB hypertables)                    │   │
│  │  ├── tool_events (hypertable, partitioned by occurred_at)        │   │
│  │  │   • Chunk interval: 1 day                                     │   │
│  │  │   • Compression: after 7 days (10-20x reduction)              │   │
│  │  │   • Retention: CONFIGURABLE per org (default: 90 days)        │   │
│  │  │                                                                │   │
│  │  ├── hourly_token_usage (continuous aggregate)                   │   │
│  │  │   • Auto-refreshed every hour                                 │   │
│  │  │   • Retention: CONFIGURABLE per org (default: 1 year)         │   │
│  │  │                                                                │   │
│  │  └── daily_token_usage (continuous aggregate)                    │   │
│  │      • Auto-refreshed daily                                      │   │
│  │      • Retention: CONFIGURABLE per org (default: forever)        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Redis                                                           │   │
│  │  • Sidekiq job queues                                            │   │
│  │  • ActionCable pub/sub                                           │   │
│  │  • Rate limiting / caching                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Enums

| Enum | Values |
|------|--------|
| **MemberRole** | `admin`, `manager`, `member` |
| **ConnectorType** | `github`, `gitlab`, `bitbucket`, `jira`, `linear`, `openrouter`, `anthropic`, `openai`, `gemini` |
| **ToolName** | `github`, `gitlab`, `bitbucket`, `jira`, `linear`, `cursor`, `claude_code`, `opencode`, `anthropic`, `gemini`, `openai`, `openrouter` |
| **EventType** | `api_call`, `completion`, `chat`, `usage_snapshot`, `loop_iteration`, `loop_exit`, `message`, `tool_use`, `conversation_start`, `conversation_end`, `session_start`, `session_end`, `commit`, `pull_request`, `merge_request`, `push`, `issue`, `issue_update`, `sprint`, `worklog` |
| **RiskLevel** | `low`, `medium`, `high`, `critical` |
| **SanitizationAction** | `redact`, `mask`, `tokenize`, `hash`, `remove`, `none` |
| **ClassificationLabel** | `pii:email`, `pii:phone`, `pii:name`, `pii:address`, `pii:ssn`, `secret:api_key`, `secret:password`, `secret:private_key`, `secret:access_token`, `secret:connection_string`, `hipaa:patient_id`, `hipaa:diagnosis`, `hipaa:treatment`, `hipaa:medical_record`, `financial:credit_card`, `financial:bank_account`, `financial:routing_number` |

### Retention Policy Enums (Configurable per Organization)

| Enum | Values | Default | Description |
|------|--------|---------|-------------|
| **RawEventTtl** | `6_hours`, `12_hours`, `24_hours`, `48_hours`, `72_hours` | `24_hours` | How long unsanitized data stays in MinIO |
| **ToolEventsRetention** | `30_days`, `60_days`, `90_days`, `180_days`, `365_days`, `730_days` | `90_days` | How long sanitized events are kept |
| **HourlyAggregateRetention** | `90_days`, `180_days`, `365_days`, `730_days` | `365_days` | How long hourly rollups are kept |
| **DailyAggregateRetention** | `365_days`, `730_days`, `1095_days`, `forever` | `forever` | How long daily rollups are kept |

#### Retention Option Details

**RawEventTtl** (MinIO quarantine before auto-delete):
| Value | Label | Use Case |
|-------|-------|----------|
| `6_hours` | 6 hours | Fastest cleanup, minimal exposure window |
| `12_hours` | 12 hours | Standard for low-risk data |
| `24_hours` | 24 hours | **Default** - allows workflow retry/review |
| `48_hours` | 48 hours | Extended review window |
| `72_hours` | 72 hours | Maximum - for complex approval workflows |

**ToolEventsRetention** (TimescaleDB sanitized events):
| Value | Label | Use Case |
|-------|-------|----------|
| `30_days` | 30 days | Minimum - recent activity only |
| `60_days` | 60 days | Short-term reporting |
| `90_days` | 90 days | **Default** - quarterly view |
| `180_days` | 6 months | Extended reporting |
| `365_days` | 1 year | Annual compliance (SOC2) |
| `730_days` | 2 years | Extended compliance (HIPAA) |

**HourlyAggregateRetention** (TimescaleDB continuous aggregate):
| Value | Label | Use Case |
|-------|-------|----------|
| `90_days` | 90 days | Minimum - recent trends |
| `180_days` | 6 months | Half-year analysis |
| `365_days` | 1 year | **Default** - annual comparison |
| `730_days` | 2 years | Extended trend analysis |

**DailyAggregateRetention** (TimescaleDB continuous aggregate):
| Value | Label | Use Case |
|-------|-------|----------|
| `365_days` | 1 year | Minimum for long-term trends |
| `730_days` | 2 years | Standard long-term |
| `1095_days` | 3 years | Extended history |
| `forever` | Forever | **Default** - never delete |

*Note: `PeriodType` enum removed - TimescaleDB's `time_bucket()` function handles time aggregation natively.*

### Configurable Retention Policies

Retention policies are configurable per organization via the Admin UI. Each organization has an `OrganizationRetentionPolicy` record with strongly-typed enum values.

#### Retention Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURABLE RETENTION ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: System Defaults (ENV / config/retention.yml)          │   │
│  │  • RAW_EVENT_TTL_DEFAULT=24_hours                                │   │
│  │  • TOOL_EVENTS_RETENTION_DEFAULT=90_days                         │   │
│  │  • HOURLY_AGGREGATE_RETENTION_DEFAULT=365_days                   │   │
│  │  • DAILY_AGGREGATE_RETENTION_DEFAULT=forever                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: Organization Overrides (organization_retention_policies)│  │
│  │  • Org A: tool_events=365_days (SOC2 compliance)                 │   │
│  │  • Org B: tool_events=90_days (using default)                    │   │
│  │  • Org C: tool_events=730_days (HIPAA compliance)                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: RetentionService                                       │   │
│  │  • Merges defaults + org overrides                               │   │
│  │  • Validates enum values                                         │   │
│  │  • Used by cleanup jobs and APIs                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 4: Enforcement                                            │   │
│  │                                                                   │   │
│  │  TimescaleDB (ceiling = longest possible retention):             │   │
│  │  • drop_chunks @ 730 days (max tool_events enum)                 │   │
│  │  • compression @ 7 days                                          │   │
│  │                                                                   │   │
│  │  OrgRetentionCleanupJob (respects per-org settings):             │   │
│  │  • Runs nightly                                                  │   │
│  │  • Deletes per org's configured retention enum                   │   │
│  │                                                                   │   │
│  │  MinIO (system-wide, respects longest org setting):              │   │
│  │  • lifecycle @ max(org.raw_event_ttl) across all orgs            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Retention Enforcement Strategy

Since TimescaleDB/MinIO policies are system-wide (not per-org), we use a hybrid approach:

1. **Database ceiling:** TimescaleDB `drop_chunks()` set to the **maximum** enum value (730 days for tool_events)
2. **Per-org cleanup:** Sidekiq job runs nightly, deleting data older than each org's configured retention
3. **Enum constraints:** Only predefined values allowed - no freeform input

```ruby
# app/services/retention_service.rb
class RetentionService
  def self.for_organization(org)
    policy = org.retention_policy || OrganizationRetentionPolicy.new
    {
      raw_event_ttl: policy.raw_event_ttl || '24_hours',
      tool_events_retention: policy.tool_events_retention || '90_days',
      hourly_aggregate_retention: policy.hourly_aggregate_retention || '365_days',
      daily_aggregate_retention: policy.daily_aggregate_retention || 'forever'
    }
  end

  def self.retention_cutoff(org, retention_type)
    policy = for_organization(org)
    enum_value = policy[retention_type]
    return nil if enum_value == 'forever'
    
    days = enum_value.gsub('_days', '').to_i
    days.days.ago
  end
end

# app/jobs/org_retention_cleanup_job.rb
class OrgRetentionCleanupJob
  include Sidekiq::Job
  sidekiq_options queue: 'maintenance'

  def perform
    Organization.find_each do |org|
      cutoff = RetentionService.retention_cutoff(org, :tool_events_retention)
      next unless cutoff  # Skip if 'forever'
      
      deleted = ToolEvent
        .where(organization_id: org.id)
        .where('occurred_at < ?', cutoff)
        .delete_all
      
      Rails.logger.info "[Retention] Org #{org.slug}: deleted #{deleted} events older than #{cutoff}"
    end
  end
end
```

#### Admin UI API

```ruby
# GET /api/v1/organizations/:id/retention_policy
{
  "current": {
    "raw_event_ttl": "24_hours",
    "tool_events_retention": "90_days",
    "hourly_aggregate_retention": "365_days",
    "daily_aggregate_retention": "forever",
    "retention_reason": null,
    "updated_at": null,
    "updated_by": null
  },
  "options": {
    "raw_event_ttl": [
      { "value": "6_hours",  "label": "6 hours" },
      { "value": "12_hours", "label": "12 hours" },
      { "value": "24_hours", "label": "24 hours", "default": true },
      { "value": "48_hours", "label": "48 hours" },
      { "value": "72_hours", "label": "72 hours" }
    ],
    "tool_events_retention": [
      { "value": "30_days",  "label": "30 days" },
      { "value": "60_days",  "label": "60 days" },
      { "value": "90_days",  "label": "90 days", "default": true },
      { "value": "180_days", "label": "6 months" },
      { "value": "365_days", "label": "1 year (SOC2)" },
      { "value": "730_days", "label": "2 years (HIPAA)" }
    ],
    // ... similar for aggregates
  }
}

# PATCH /api/v1/organizations/:id/retention_policy
{
  "tool_events_retention": "365_days",
  "retention_reason": "SOC2 compliance requirement"
}
```

### Role Permissions

Roles apply at both **Organization** and **Project** levels:

| Role | Organization Scope | Project Scope |
|------|-------------------|---------------|
| **Admin** | Manage billing, org settings, all projects, invite members, manage connectors | Full control of project settings, members, repositories |
| **Manager** | View org analytics, manage team assignments | Manage project settings, assign work, view all data |
| **Member** | Access assigned projects only, **must link tool accounts** | View and contribute to project data |

### Authorization (Action Policy)

Action Policy provides authorization with built-in multi-tenant context support, pre-checks, and caching.

#### Controller Setup

```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  include ActionPolicy::Controller

  # Make user and organization available to all policies
  authorize :user, through: :current_user
  authorize :organization, through: :current_organization

  rescue_from ActionPolicy::Unauthorized do |ex|
    render json: { 
      error: 'Forbidden',
      message: ex.result.message,
      reasons: ex.result.reasons.details
    }, status: :forbidden
  end
end
```

#### Policy with Pre-checks and Context

```ruby
# app/policies/application_policy.rb
class ApplicationPolicy < ActionPolicy::Base
  # Available in all policies
  authorize :user
  authorize :organization

  # Pre-checks run before every rule
  pre_check :require_org_membership!

  private

  def require_org_membership!
    deny! unless user.member_of?(organization)
  end
end

# app/policies/project_policy.rb
class ProjectPolicy < ApplicationPolicy
  # Pre-check already ensures user is org member

  def index?
    true  # Any org member can list projects
  end

  def show?
    record.organization == organization
  end

  def create?
    user.admin_or_manager_of?(organization)
  end

  def update?
    user.admin_or_manager_of?(organization) ||
      user.admin_or_manager_of?(record)
  end

  def destroy?
    user.admin_of?(organization)
  end

  # Scoping - automatically filters to current org
  relation_scope do |relation|
    relation.where(organization: organization)
  end
end
```

#### Multi-Tenant Data Isolation

```ruby
# All queries automatically scoped via policies
class ProjectsController < ApplicationController
  def index
    # Only returns projects for current_organization
    @projects = authorized_scope(Project.all)
    render json: @projects
  end

  def show
    @project = authorized_scope(Project.all).find(params[:id])
    authorize! @project
    render json: @project
  end
end
```

#### Policy Caching (Performance)

```ruby
# config/initializers/action_policy.rb
ActionPolicy.cache_store = Rails.cache

# Policies can cache expensive checks within a request
class ProjectPolicy < ApplicationPolicy
  def show?
    # This result is cached for the duration of the request
    allowed_to?(:access?, record.organization)
  end
end
```

### Project Ownership

Projects can be owned in two ways:
- **Organization Project:** `organization_id` is set, `owner_id` is null
- **Personal Project:** `owner_id` is set, `organization_id` is null (no external repo sync for personal projects)

**Personal Projects and Sanitization:**
Events from personal projects still go through the Temporal Ingestion Sanitization Workflow. The workflow handles null `organization_id` by using system-default sanitization policies. Personal projects:
- Use system-default retention policies (not org-configurable)
- Still have sanitized events stored in TimescaleDB
- Still generate audit logs for compliance
- Cannot use org-level connectors (no repo sync)

---

## 1.2 Global Admin Panel (Administrate)

A global administration layer using Administrate provides system-wide management capabilities separate from organization-level administration.

### Directory Structure

```
packages/api/
├── app/
│   ├── dashboards/                    # Administrate dashboard configurations
│   │   ├── admin_audit_log_dashboard.rb
│   │   ├── audit_log_dashboard.rb
│   │   ├── organization_dashboard.rb
│   │   ├── organization_connector_dashboard.rb
│   │   ├── organization_retention_policy_dashboard.rb
│   │   ├── project_dashboard.rb
│   │   ├── repository_dashboard.rb
│   │   ├── sanitization_policy_dashboard.rb
│   │   ├── tool_event_dashboard.rb
│   │   └── user_dashboard.rb
│   │
│   └── controllers/
│       └── admin/                     # Admin controllers
│           ├── application_controller.rb
│           ├── admin_audit_logs_controller.rb
│           ├── audit_logs_controller.rb
│           ├── organizations_controller.rb
│           ├── organization_connectors_controller.rb
│           ├── organization_retention_policies_controller.rb
│           ├── projects_controller.rb
│           ├── repositories_controller.rb
│           ├── sanitization_policies_controller.rb
│           ├── tool_events_controller.rb
│           └── users_controller.rb
│
└── config/
    └── routes/
        └── admin_routes.rb            # All admin routes (alphabetical)
```

### Admin Routes Organization

**CRITICAL:** All admin resources are defined in `config/routes/admin_routes.rb` within the `AdminRoutes` module and must be organized in **alphabetical order** within the `namespace :admin` block.

```ruby
# config/routes/admin_routes.rb
module AdminRoutes
  def self.extended(router)
    router.instance_exec do
      namespace :admin do
        root to: 'dashboard#index'

        # Main Resources (Full CRUD + Batch Operations) - ALPHABETICAL ORDER
        resources :organizations do
          collection do
            post :batch_delete
            get :export
          end
          member do
            post :impersonate
            post :suspend
            post :activate
          end
        end

        resources :organization_connectors, only: %i[index show] do
          collection do
            get :export
          end
          member do
            post :force_sync
            post :revoke
          end
        end

        resources :organization_retention_policies do
          collection do
            get :export
          end
        end

        resources :projects do
          collection do
            post :batch_delete
            get :export
          end
        end

        resources :sanitization_policies do
          collection do
            post :batch_delete
            get :export
          end
          member do
            post :activate
            post :deactivate
          end
        end

        resources :users do
          collection do
            post :batch_delete
            get :export
          end
          member do
            post :impersonate
            post :suspend
            post :activate
            post :reset_password
          end
        end

        # Read-Only Resources (Index/Show + Export) - ALPHABETICAL ORDER
        resources :admin_audit_logs, only: %i[index show] do
          collection do
            get :export
          end
        end

        resources :audit_logs, only: %i[index show] do
          collection do
            get :export
          end
        end

        resources :repositories, only: %i[index show] do
          collection do
            get :export
          end
        end

        resources :tool_events, only: %i[index show] do
          collection do
            get :export
          end
        end

        # Nested Resources - ALPHABETICAL ORDER
        namespace :organization do
          resources :memberships, only: %i[index show]
        end

        namespace :user do
          resources :tool_accounts, only: %i[index show]
        end
      end
    end
  end
end

# config/routes.rb
Rails.application.routes.draw do
  extend AdminRoutes
  # ... other routes
end
```

### Dashboard Configuration

All dashboard files inherit from `Administrate::BaseDashboard`:

```ruby
# app/dashboards/organization_dashboard.rb
class OrganizationDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = {
    id: Field::String,
    name: Field::String,
    slug: Field::String,
    is_active: Field::Boolean,
    retention_policy: Field::BelongsTo,
    memberships: Field::HasMany,
    projects: Field::HasMany,
    connectors: Field::HasMany.with_options(class_name: 'OrganizationConnector'),
    members_count: Field::Number,
    projects_count: Field::Number,
    events_count: Field::Number,
    created_at: Field::DateTime,
    updated_at: Field::DateTime
  }.freeze

  COLLECTION_ATTRIBUTES = %i[
    name
    slug
    is_active
    members_count
    projects_count
    created_at
  ].freeze

  SHOW_PAGE_ATTRIBUTES = %i[
    id
    name
    slug
    is_active
    retention_policy
    members_count
    projects_count
    events_count
    connectors
    created_at
    updated_at
  ].freeze

  FORM_ATTRIBUTES = %i[
    name
    slug
    is_active
  ].freeze

  COLLECTION_FILTERS = {
    is_active: ->(resources, value) { resources.where(is_active: value == 'true') }
  }.freeze

  def display_resource(organization)
    organization.name
  end
end
```

### Admin Base Controller

```ruby
# app/controllers/admin/application_controller.rb
module Admin
  class ApplicationController < Administrate::ApplicationController
    before_action :authenticate_admin!
    before_action :log_admin_action

    # Require global admin role (not org-level admin)
    def authenticate_admin!
      unless current_user&.global_admin?
        redirect_to root_path, alert: 'Access denied. Global admin required.'
      end
    end

    # Audit all admin actions (separate from sanitization AuditLog)
    def log_admin_action
      return if request.get?
      
      AdminAuditLog.create!(
        admin_user_id: current_user.id,
        action: "#{controller_name}##{action_name}",
        resource_type: resource_class.name,
        resource_id: params[:id],
        ip_address: request.remote_ip,
        user_agent: request.user_agent,
        changes: track_changes,
        metadata: filtered_params
      )
    end
    
    def track_changes
      return {} unless resource_params.present?
      # Track before/after for update actions
      {}  # Implement per-resource change tracking
    end

    private

    def filtered_params
      params.to_unsafe_h.except(:controller, :action, :authenticity_token, :password)
    end

    # Override to add global scoping (no org filter for global admin)
    def scoped_resource
      resource_class.all
    end
  end
end
```

### Admin Resources Summary

| Resource | Type | Actions | Special Features |
|----------|------|---------|-----------------|
| **organizations** | Full CRUD | batch_delete, export | impersonate, suspend, activate |
| **organization_connectors** | Read + Actions | export | force_sync, revoke (connectors created via org OAuth flows, not admin panel) |
| **organization_retention_policies** | Full CRUD | export | — |
| **projects** | Full CRUD | batch_delete, export | — |
| **sanitization_policies** | Full CRUD | batch_delete, export | activate, deactivate |
| **users** | Full CRUD | batch_delete, export | impersonate, suspend, reset_password |
| **audit_logs** | Read-only | export | Sanitization workflow audit trail |
| **admin_audit_logs** | Read-only | export | Admin panel action history |
| **repositories** | Read-only | export | — |
| **tool_events** | Read-only | export | — |

### Global Admin Features

| Feature | Description |
|---------|-------------|
| **Organization Management** | Create, edit, suspend, delete any organization |
| **User Management** | View all users, reset passwords, suspend accounts |
| **Impersonation** | Log in as any user/org for debugging (audited) |
| **System Stats** | Dashboard with total events, users, storage |
| **Retention Override** | Modify any org's retention policy |
| **Connector Health** | View sync status, force re-sync, revoke tokens |
| **Admin Audit Logs** | View all admin panel actions (read-only) |
| **Audit Logs** | View sanitization workflow audit trail (read-only) |
| **Sanitization Policies** | Manage global sanitization rules |
| **Data Export** | Export any resource to CSV |
| **Batch Operations** | Bulk delete, bulk update |

### Security Guidelines

1. **Authentication:** All admin routes protected by `authenticate_admin!`
2. **Authorization:** Requires `global_admin?` role (separate from org admin)
3. **Audit Logging:** All non-GET admin actions logged to `admin_audit_logs`
4. **Rate Limiting:** Admin actions rate-limited to prevent abuse
5. **IP Allowlisting:** Optional IP restriction for admin panel (production)
6. **Impersonation:** Logged with timestamp, admin user, target user/org

### Adding New Admin Resources

**For Full CRUD resources:**
```ruby
resources :new_resource do
  collection do
    post :batch_delete
    get :export
  end
end
```

**For Read-Only resources:**
```ruby
resources :new_resource, only: %i[index show] do
  collection do
    get :export
  end
end
```

**Dashboard file:**
```ruby
# app/dashboards/new_resource_dashboard.rb
class NewResourceDashboard < Administrate::BaseDashboard
  ATTRIBUTE_TYPES = { ... }.freeze
  COLLECTION_ATTRIBUTES = %i[ ... ].freeze
  SHOW_PAGE_ATTRIBUTES = %i[ ... ].freeze
  FORM_ATTRIBUTES = %i[ ... ].freeze
end
```

**Controller file:**
```ruby
# app/controllers/admin/new_resources_controller.rb
module Admin
  class NewResourcesController < Admin::ApplicationController
    # Inherits authentication, authorization, and audit logging
  end
end
```

---

## 1.3 Tool Connection Model

Tools connect at two levels: **Organization** (for syncing repos/projects/issues) and **User** (for attribution and telemetry).

### Organization-Level Connectors (OrganizationConnector)

These connect external services at the organization level:

| Connector | External Entity | Purpose | Auth Method |
|-----------|-----------------|---------|-------------|
| **GitHub** | GitHub Org/User | Sync repos, PRs, commits, issues, Projects | GitHub App or OAuth |
| **GitLab** | GitLab Group | Sync projects, MRs, commits, issues | Group Access Token |
| **Bitbucket** | Workspace | Sync repos, PRs, commits | OAuth 2.0 |
| **Jira** | Jira Site | Sync projects, issues, sprints, worklogs | OAuth 2.0 (3LO) |
| **Linear** | Workspace | Sync teams, projects, issues, cycles | OAuth 2.0 |
| **OpenRouter** | API Account | AI Gateway (unified) - routes to multiple providers | API Key |
| **Anthropic** | API Account | Direct Claude API access + usage sync | API Key |
| **OpenAI** | API Account | Direct GPT API access + usage sync | API Key |
| **Gemini** | API Account | Direct Gemini API access + usage sync | API Key |

### AI Provider Integration Options

Organizations can choose how to integrate AI providers:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **OpenRouter Only** | All AI calls routed through OpenRouter | Single API key, unified billing, model flexibility | Extra hop, OpenRouter fees |
| **Direct APIs Only** | Connect directly to Anthropic/OpenAI/Gemini | No middleman, potentially lower latency | Multiple API keys, separate billing |
| **Hybrid** | OpenRouter + some direct connections | Best of both worlds | More complex configuration |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI Integration Options                                │
│                                                                          │
│  Option A: OpenRouter Gateway                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  App → DB90 API → OpenRouter → Claude/GPT/Gemini/Llama/etc.    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Option B: Direct API Connections                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  App → DB90 API → Anthropic API → Claude                        │   │
│  │  App → DB90 API → OpenAI API → GPT                              │   │
│  │  App → DB90 API → Google API → Gemini                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Option C: Hybrid                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  App → DB90 API → OpenRouter → Llama, Mistral (open models)    │   │
│  │  App → DB90 API → Anthropic API → Claude (direct)               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### OpenRouter Integration (AI Gateway + Analytics)

OpenRouter serves **two purposes** for the organization:

#### 1. AI Gateway (Real-Time Proxy)
- **Single API key** for accessing multiple AI providers (Claude, GPT-4, Gemini, Llama, etc.)
- **Centralized billing** at the org level
- **Model routing** based on org configuration
- **Real-time event creation** when calls are proxied through DB90

#### 2. Usage Analytics Sync (Correlation Engine)
- **Pull usage data** from OpenRouter's API (including calls made outside DB90 proxy)
- **Correlate with team members** - match API calls to users
- **Correlate with projects** - attribute usage to active projects
- **Correlate with repos/commits** - link AI usage to code activity
- **Correlate with activity events** - build unified timeline of AI + dev activity

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OpenRouter Connector                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    1. API Gateway (Real-Time)                    │    │
│  │                                                                   │    │
│  │   App/IDE ──► POST /api/v1/ai/completions ──► OpenRouter ──► AI  │    │
│  │                              │                                    │    │
│  │                              ▼                                    │    │
│  │                   ToolEvent created instantly                     │    │
│  │                   (user, project, tokens, cost)                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 2. Analytics Sync (Background Job)               │    │
│  │                                                                   │    │
│  │   OpenRouterSyncJob (runs hourly)                                │    │
│  │          │                                                        │    │
│  │          ▼                                                        │    │
│  │   GET /api/v1/activity (OpenRouter API)                          │    │
│  │          │                                                        │    │
│  │          ▼                                                        │    │
│  │   For each usage record:                                         │    │
│  │      • Match to user (by metadata, API key, time correlation)    │    │
│  │      • Match to project (by request metadata or inference)       │    │
│  │      • Match to repo/commit (by file paths in context)           │    │
│  │      • Link to nearby activity events (commits, PRs, issues)     │    │
│  │          │                                                        │    │
│  │          ▼                                                        │    │
│  │   Create/Update ToolEvent with correlations                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Usage Correlation Strategy:**

| Correlation Target | Method |
|-------------------|--------|
| **User** | API key identifier, request metadata, time-based matching with IDE telemetry |
| **Project** | Request metadata tags, infer from user's active project during time window |
| **Repository** | File paths in prompts/context, match with user's recent repo activity |
| **Commit/PR** | Time correlation (AI call within N minutes of commit), explicit metadata |
| **Activity Events** | Time-window matching to build unified activity timeline |

**OpenRouter Connector Config:**
```json
{
  "api_key": "sk-or-v1-xxx",
  "allowed_models": ["anthropic/claude-3-opus", "openai/gpt-4", "google/gemini-pro"],
  "default_model": "anthropic/claude-3-opus",
  "rate_limits": {
    "requests_per_minute": 60,
    "tokens_per_day": 1000000
  },
  "cost_alerts": {
    "daily_threshold_usd": 100,
    "monthly_threshold_usd": 2000
  },
  "analytics_sync": {
    "enabled": true,
    "sync_interval_minutes": 60,
    "correlation_window_minutes": 30,
    "correlate_with": ["users", "projects", "repos", "commits", "activity"]
  }
}
```

### User-Level Tool Accounts (UserToolAccount)

These are **required** for team members and scoped per-organization (a user may have different accounts in different orgs):

| Tool | Purpose | Auth Method |
|------|---------|-------------|
| **GitHub** | Commit/PR attribution, author mapping | OAuth (user) |
| **GitLab** | Commit/MR attribution | OAuth (user) |
| **Bitbucket** | Commit/PR attribution | OAuth (user) |
| **Jira** | Assignee/reporter mapping, worklog attribution | OAuth (user) or auto-map by email |
| **Linear** | Assignee mapping | OAuth (user) or auto-map by email |

### Telemetry Sources (User-Level, Real-Time Push)

These emit events directly from the user's IDE/CLI:

| Source | Events | Auth |
|--------|--------|------|
| **Cursor** | `session_start`, `session_end`, `completion`, tokens | API token per user |
| **Claude Code** | `conversation_*`, `message`, `tool_use`, `loop_*`, tokens | API token per user |
| **OpenCode** | `conversation_*`, `message`, `tool_use`, tokens | API token per user |

### Connection Flow Diagram

```mermaid
flowchart TB
    subgraph OrgLevel["Organization Level"]
        OrgAdmin["Org Admin"]
        OrgConnectors["OrganizationConnector"]
        
        OrgAdmin -->|"connects"| GitHub["GitHub Org"]
        OrgAdmin -->|"connects"| GitLab["GitLab Group"]
        OrgAdmin -->|"connects"| Bitbucket["Bitbucket Workspace"]
        OrgAdmin -->|"connects"| Jira["Jira Site"]
        OrgAdmin -->|"connects"| Linear["Linear Workspace"]
        OrgAdmin -->|"connects"| OpenRouter["OpenRouter API"]
        OrgAdmin -->|"connects (optional)"| Anthropic["Anthropic API"]
        OrgAdmin -->|"connects (optional)"| OpenAI["OpenAI API"]
        OrgAdmin -->|"connects (optional)"| Gemini["Gemini API"]
        
        GitHub --> OrgConnectors
        GitLab --> OrgConnectors
        Bitbucket --> OrgConnectors
        Jira --> OrgConnectors
        Linear --> OrgConnectors
        OpenRouter --> OrgConnectors
        Anthropic --> OrgConnectors
        OpenAI --> OrgConnectors
        Gemini --> OrgConnectors
    end

    subgraph UserLevel["User Level (per Org Membership)"]
        TeamMember["Team Member"]
        UserAccounts["UserToolAccount"]
        
        TeamMember -->|"links (required)"| UserGH["GitHub Account"]
        TeamMember -->|"links (required)"| UserGL["GitLab Account"]
        TeamMember -->|"links (required)"| UserBB["Bitbucket Account"]
        TeamMember -->|"links (optional)"| UserJira["Jira Account"]
        TeamMember -->|"links (optional)"| UserLinear["Linear Account"]
        
        UserGH --> UserAccounts
        UserGL --> UserAccounts
        UserBB --> UserAccounts
        UserJira --> UserAccounts
        UserLinear --> UserAccounts
    end

    subgraph Telemetry["Telemetry (Real-Time Push)"]
        IDE["Developer IDE/CLI"]
        
        IDE -->|"emits events"| Cursor["Cursor"]
        IDE -->|"emits events"| ClaudeCode["Claude Code"]
        IDE -->|"emits events"| OpenCode["OpenCode"]
    end

    OrgConnectors -->|"syncs repos, issues"| DB[(Database)]
    UserAccounts -->|"enables attribution"| DB
    Cursor -->|"POST /telemetry"| DB
    ClaudeCode -->|"POST /telemetry"| DB
    OpenCode -->|"POST /telemetry"| DB
```

### Attribution Flow

When events are ingested, users are attributed via their linked tool accounts:

```
1. Org connector syncs commit from GitHub
2. Commit has author email: "john@acme.com"
3. System looks up UserToolAccount where:
   - organization_membership.organization_id = current org
   - external_email = "john@acme.com" OR external_username matches
4. If found → attribute to that user
5. If not found → create unattributed event (flagged for review)
```

---

## 2. Application Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Browser["Browser"]
    end

    subgraph Docker["Docker Compose Environment"]
        subgraph Frontend["Frontend Container"]
            Vite["Vite + React SPA<br/>Port 3000"]
        end

        subgraph Backend["Rails Container"]
            Rails["Ruby on Rails API<br/>Port 3001"]
            ActionCable["ActionCable<br/>WebSocket/SSE"]
        end

        subgraph Workers["Sidekiq Container"]
            Sidekiq["Sidekiq Workers"]
        end

        subgraph Orchestration["Temporal Cluster"]
            TemporalServer["Temporal Server<br/>Port 7233"]
            TemporalUI["Temporal UI<br/>Port 8088"]
            TemporalWorker["Temporal Workers<br/>(Ruby)"]
        end

        subgraph Identity["Keycloak Container"]
            Keycloak["Keycloak<br/>Port 8080"]
        end

        subgraph DataLayer["Data Layer"]
            subgraph PostgresCluster["PostgreSQL + TimescaleDB"]
                PostgreSQL[(PostgreSQL<br/>Port 5432)]
                Timescale["TimescaleDB Extension"]
            end
            Redis[(Redis<br/>Port 6379)]
            MinIO[(MinIO<br/>Port 9000/9001)]
        end

        subgraph Alerting["Alerting Layer"]
            AlertManager["Alert Router"]
        end
    end

    subgraph VCS["Version Control APIs"]
        GitHub["GitHub API"]
        GitLab["GitLab API"]
        Bitbucket["Bitbucket API"]
    end

    subgraph PM["Project Management APIs"]
        Jira["Jira API"]
        Linear["Linear API"]
    end

    subgraph AIProviders["AI Providers (org chooses integration method)"]
        OpenRouter["OpenRouter API<br/>(unified gateway)"]
        Anthropic["Anthropic API<br/>(direct)"]
        OpenAI["OpenAI API<br/>(direct)"]
        Gemini["Google Gemini API<br/>(direct)"]
    end

    Browser --> Vite
    Browser -->|"OIDC Auth Flow"| Keycloak
    Vite -->|"REST API<br/>Bearer Token"| Rails
    Vite <-->|"SSE/WebSocket"| ActionCable

    Rails --> PostgreSQL
    Rails --> Redis
    Rails -->|"Raw events (temp)"| MinIO
    Rails -->|"Validate JWT"| Keycloak
    Rails -->|"Start Workflow"| TemporalServer
    Rails -->|"AI Proxy (if configured)"| OpenRouter
    Rails -->|"AI Proxy (if configured)"| Anthropic
    Rails -->|"AI Proxy (if configured)"| OpenAI
    Rails -->|"AI Proxy (if configured)"| Gemini

    TemporalServer --> PostgreSQL
    TemporalWorker --> TemporalServer
    TemporalWorker -->|"Read raw, write sanitized"| PostgreSQL
    TemporalWorker -->|"Fetch/delete raw"| MinIO
    TemporalWorker -->|"Escalations"| AlertManager

    Sidekiq --> PostgreSQL
    Sidekiq --> Redis
    Sidekiq -->|"Raw events (temp)"| MinIO
    Sidekiq -->|"Enqueue Workflow"| TemporalServer

    Keycloak --> PostgreSQL

    Sidekiq -->|"Sync repos, PRs, commits"| GitHub
    Sidekiq -->|"Sync repos, MRs, commits"| GitLab
    Sidekiq -->|"Sync repos, PRs"| Bitbucket
    Sidekiq -->|"Sync issues, sprints"| Jira
    Sidekiq -->|"Sync issues, cycles"| Linear
    Sidekiq -->|"Sync usage (if configured)"| OpenRouter
    Sidekiq -->|"Sync usage (if configured)"| Anthropic
    Sidekiq -->|"Sync usage (if configured)"| OpenAI
    Sidekiq -->|"Sync usage (if configured)"| Gemini
```

### Monorepo Structure

This project is managed as a **simplified monorepo** with two main packages (Rails API + React SPA) plus supporting infrastructure. Unlike JavaScript-heavy monorepos, we don't need npm workspaces or Turborepo since there's minimal shared code between Ruby and TypeScript.

**Why Monorepo:**
- Atomic commits across frontend + backend + Temporal
- Single docker-compose for local development
- Coordinated deployments (API changes often need frontend changes)
- Single clone for new developers

**Tooling:**
- **Makefile** - Unified commands across Ruby/JS boundary
- **Docker Compose** - Local development environment
- **No npm workspaces** - Only one JS package, not needed

### Package Structure

```
db90-dash/
├── packages/
│   ├── web/                    # Vite + React SPA (port 3000)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/         # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   │   │   └── ...         # Custom app components
│   │   │   ├── pages/          # Route pages
│   │   │   ├── hooks/          # Custom hooks
│   │   │   │   └── useEventStream.ts
│   │   │   ├── lib/            # API client, utilities
│   │   │   │   ├── api.ts
│   │   │   │   └── auth.ts     # Keycloak integration
│   │   │   ├── types/          # TypeScript types (generated from OpenAPI)
│   │   │   │   └── api.d.ts    # Auto-generated API types
│   │   │   └── App.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── api/                    # Ruby on Rails API (port 3001)
│       ├── app/
│       │   ├── controllers/
│       │   │   ├── api/v1/     # Versioned API controllers
│       │   │   ├── admin/      # Administrate controllers
│       │   │   ├── telemetry/  # Telemetry ingestion
│       │   │   └── webhooks/   # External webhooks
│       │   ├── dashboards/     # Administrate dashboards
│       │   ├── models/         # ActiveRecord models
│       │   ├── policies/       # Action Policy authorization
│       │   ├── jobs/           # Sidekiq background jobs
│       │   │   ├── github_sync_job.rb
│       │   │   ├── gitlab_sync_job.rb
│       │   │   ├── bitbucket_sync_job.rb
│       │   │   ├── jira_sync_job.rb
│       │   │   ├── linear_sync_job.rb
│       │   │   ├── ai_usage_sync_job.rb
│       │   │   ├── attribution_job.rb
│       │   │   ├── cost_alert_job.rb
│       │   │   └── org_retention_cleanup_job.rb
│       │   ├── services/       # Business logic services
│       │   │   ├── user_sync_service.rb
│       │   │   ├── retention_service.rb
│       │   │   ├── raw_event_store.rb
│       │   │   ├── ai_proxy_service.rb
│       │   │   ├── ai_correlation_service.rb
│       │   │   └── connectors/
│       │   │       ├── github_connector.rb
│       │   │       ├── gitlab_connector.rb
│       │   │       ├── bitbucket_connector.rb
│       │   │       ├── jira_connector.rb
│       │   │       ├── linear_connector.rb
│       │   │       ├── openrouter_client.rb
│       │   │       ├── anthropic_client.rb
│       │   │       ├── openai_client.rb
│       │   │       └── gemini_client.rb
│       │   ├── channels/       # ActionCable channels
│       │   └── serializers/    # JSON serializers
│       ├── config/
│       │   ├── routes.rb
│       │   ├── routes/
│       │   │   └── admin_routes.rb
│       │   └── initializers/
│       │       ├── keycloak.rb
│       │       ├── action_policy.rb
│       │       └── sidekiq.rb
│       ├── db/
│       │   ├── migrate/        # Database migrations
│       │   └── seeds.rb
│       ├── lib/
│       │   └── pricing.rb      # Cost calculations
│       ├── spec/               # RSpec tests
│       └── Gemfile
│
├── temporal/                   # Temporal workflow orchestration
│   ├── workflows/              # Workflow definitions
│   │   ├── ingestion_sanitization_workflow.rb
│   │   ├── approval_workflow.rb
│   │   └── provisioning_workflow.rb
│   ├── activities/             # Activity implementations
│   │   ├── classification_activity.rb
│   │   ├── sanitization_activity.rb
│   │   ├── persistence_activity.rb
│   │   ├── audit_activity.rb
│   │   └── alert_activity.rb
│   ├── workers/                # Worker entry points
│   │   └── ingestion_worker.rb
│   └── Gemfile                 # temporalio gem
│
├── keycloak/
│   ├── realm-export.json       # DB90 realm configuration
│   └── themes/                 # Custom login themes (optional)
│
├── scripts/                    # Development scripts
│   ├── generate-api-types.sh   # OpenAPI → TypeScript
│   └── reset-db.sh
│
├── docker-compose.yml          # Development services
├── docker-compose.prod.yml     # Production overrides
├── Dockerfile.web              # Vite/React build
├── Dockerfile.api              # Rails + Sidekiq
├── Dockerfile.temporal-worker  # Temporal worker
├── Makefile                    # Unified dev commands
├── .github/
│   └── workflows/
│       ├── ci.yml              # Test on PR
│       └── deploy.yml          # Deploy on merge
└── README.md
```

### Makefile (Unified Commands)

```makefile
# Makefile - Unified commands across Ruby/JS boundary

.PHONY: up down logs api web temporal test

# ============ Docker Compose ============
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

restart:
	docker-compose restart

# ============ Individual Services ============
api:
	cd packages/api && bin/rails server -p 3001

web:
	cd packages/web && npm run dev

sidekiq:
	cd packages/api && bundle exec sidekiq

temporal-worker:
	cd temporal && bundle exec ruby workers/ingestion_worker.rb

# ============ Database ============
db-create:
	cd packages/api && bin/rails db:create

db-migrate:
	cd packages/api && bin/rails db:migrate

db-seed:
	cd packages/api && bin/rails db:seed

db-reset:
	cd packages/api && bin/rails db:drop db:create db:migrate db:seed

db-console:
	cd packages/api && bin/rails dbconsole

# ============ Code Generation ============
generate-types:
	cd packages/api && bin/rails rswag:specs:swaggerize
	npx openapi-typescript packages/api/swagger/v1/swagger.yaml -o packages/web/src/types/api.d.ts

# ============ Testing ============
test-api:
	cd packages/api && bundle exec rspec

test-web:
	cd packages/web && npm test

test: test-api test-web

# ============ Linting ============
lint-api:
	cd packages/api && bundle exec rubocop

lint-web:
	cd packages/web && npm run lint

lint: lint-api lint-web

# ============ Setup ============
setup:
	cd packages/api && bundle install
	cd packages/web && npm install
	cd temporal && bundle install
	make db-create db-migrate db-seed

# ============ Console ============
console:
	cd packages/api && bin/rails console
```

### Type Generation (OpenAPI → TypeScript)

For type safety between Rails API responses and the React frontend, we generate TypeScript types from an OpenAPI spec:

```bash
# 1. Rails generates OpenAPI spec (using rswag gem)
cd packages/api && bin/rails rswag:specs:swaggerize

# 2. Generate TypeScript types from OpenAPI
npx openapi-typescript packages/api/swagger/v1/swagger.yaml \
  -o packages/web/src/types/api.d.ts

# Or just run:
make generate-types
```

**Rails Setup (rswag gem):**
```ruby
# Gemfile
gem 'rswag-api'
gem 'rswag-specs'

# spec/swagger_helper.rb - generates OpenAPI from RSpec request specs
```

**Usage in React:**
```typescript
import type { paths, components } from '@/types/api';

// Strongly typed API response
type Organization = components['schemas']['Organization'];
type Project = components['schemas']['Project'];
```

### Removed Packages

The following packages from the old Express/Prisma architecture are **no longer needed**:

| Old Package | Reason Removed |
|-------------|----------------|
| `packages/shared/` | TypeScript types now generated from Rails OpenAPI. Prisma schema replaced by ActiveRecord migrations. |
| `packages/worker/` | Sidekiq runs inside Rails container. No separate Node.js worker. |

### Docker Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **web** | Custom (Vite build) | 3000 | React SPA frontend |
| **api** | Custom (Rails) | 3001 | REST API server |
| **sidekiq** | Same as api | - | Background job processor |
| **temporal** | temporalio/auto-setup | 7233 | Workflow orchestration server |
| **temporal-ui** | temporalio/ui | 8088 | Temporal web UI |
| **temporal-worker** | Custom (Ruby) | - | Executes Temporal workflows/activities |
| **keycloak** | quay.io/keycloak/keycloak | 8080 | Identity provider |
| **postgres** | timescale/timescaledb:latest-pg16 | 5432 | Primary database + TimescaleDB for time-series |
| **redis** | redis:7 | 6379 | Sidekiq queue, caching |
| **minio** | minio/minio | 9000, 9001 | Object storage for raw event quarantine (S3-compatible) |

---

## 3. Authentication Flow Diagram

### Login Flow (OIDC Authorization Code + PKCE)

```mermaid
sequenceDiagram
    autonumber
    participant User as Browser
    participant SPA as React SPA
    participant KC as Keycloak
    participant API as Rails API
    participant DB as PostgreSQL

    User->>SPA: Click Sign In
    SPA->>SPA: Generate PKCE code_verifier<br/>and code_challenge
    SPA->>KC: Redirect to /auth<br/>with code_challenge
    User->>KC: Enter credentials
    KC->>KC: Authenticate user
    KC-->>SPA: Redirect with auth code
    SPA->>KC: POST /token<br/>with code + code_verifier
    KC-->>SPA: Return tokens<br/>access_token, refresh_token, id_token
    SPA->>SPA: Store tokens in memory<br/>refresh_token in httpOnly cookie

    Note over User,DB: First API Request - User Sync

    SPA->>API: GET /api/v1/users/me<br/>Authorization Bearer access_token
    API->>KC: Validate JWT via JWKS
    KC-->>API: Token valid
    API->>API: Extract keycloak_sub from token
    API->>DB: Find or create User by keycloak_sub
    DB-->>API: User record
    API-->>SPA: Return user data
```

### Token Refresh Flow

```mermaid
sequenceDiagram
    autonumber
    participant SPA as React SPA
    participant KC as Keycloak
    participant API as Rails API

    SPA->>SPA: Access token expired or expiring soon
    SPA->>KC: POST /token<br/>grant_type=refresh_token
    KC-->>SPA: New access_token + refresh_token
    SPA->>SPA: Update stored tokens
    SPA->>API: Continue API request<br/>with new access_token
```

### Authentication Details

| Component | Details |
|-----------|---------|
| **Identity Provider** | Keycloak (self-hosted in Docker) |
| **Protocol** | OpenID Connect (OIDC) |
| **Flow** | Authorization Code + PKCE (for SPA security) |
| **Access Token** | JWT, stored in memory, short-lived (5-15 min) |
| **Refresh Token** | Opaque, stored in httpOnly cookie, longer-lived (24h-7d) |
| **ID Token** | JWT containing user profile claims |
| **Token Validation** | Rails validates JWT signature via Keycloak JWKS endpoint |

### Keycloak Configuration

```yaml
Realm: db90

Realm Settings:
  Login:
    User Registration: OFF
    Forgot Password: OFF
    Remember Me: ON
  Tokens:
    Access Token Lifespan: 15 minutes
    Refresh Token Lifespan: 7 days

Clients:
  db90-web:
    Client Type: Public (SPA)
    Valid Redirect URIs:
      - http://localhost:3000/*
      - https://app.db90.io/*
    Web Origins:
      - http://localhost:3000
      - https://app.db90.io
    PKCE: Required (S256)

Identity Providers:
  # Phase 1: Internal team only
  google-dbp:
    Alias: google-dbp
    Display Name: "Sign in with Google (Acme Corp)"
    Provider: Google
    Client ID: <from Google Cloud Console>
    Client Secret: <secret>
    Hosted Domain: example.com
    Sync Mode: FORCE
    Trust Email: true
    First Login Flow: first broker login

  # Phase 2: Add when ready for sister company
  # google-fueled:
  #   Alias: google-fueled
  #   Display Name: "Sign in with Google (Fueled)"
  #   Hosted Domain: partner.example.com
  #   ...same config as above...

Authentication Flows:
  Browser:
    - Identity Provider Redirector (google-dbp) - ALTERNATIVE
    # Add google-fueled when Phase 2
  
  First Broker Login:
    - Create User If Unique - ALTERNATIVE
    - Automatically Link Brokered Account - ALTERNATIVE
```

### Keycloak Evolution Plan

| Phase | Setup | Custom Code |
|-------|-------|-------------|
| **Phase 1** | Single Google IDP with `hostedDomain: example.com` | None |
| **Phase 2** | Add second Google IDP with `hostedDomain: partner.example.com` | None |
| **Phase 3** | Add customer IDPs (SAML/OIDC) + email-first routing | Domain validator SPI (optional) |

**Key Principle:** Keep Keycloak simple - it handles authentication only. All organizations, roles, and business logic live in Rails.

### User Sync Strategy

When a user authenticates, their Keycloak profile syncs to the local database:

| Keycloak Claim | User Column | Notes |
|----------------|-------------|-------|
| `sub` | `keycloak_sub` | Primary identifier, never changes |
| `email` | `email` | May be updated if changed in Keycloak |
| `name` | `name` | Display name |
| `picture` | `avatar_url` | Profile picture URL |

### Keycloak vs Rails Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KEYCLOAK (Authentication)                             │
│                                                                          │
│  ✓ "Who is this person?"                                                │
│  ✓ Google SSO login                                                     │
│  ✓ Domain restrictions (hostedDomain)                                   │
│  ✓ JWT token issuance                                                   │
│  ✓ Token refresh                                                        │
│                                                                          │
│  ✗ Does NOT know about organizations                                    │
│  ✗ Does NOT know about projects                                         │
│  ✗ Does NOT know about roles (admin/manager/member)                     │
│  ✗ Does NOT handle authorization                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    RAILS (Authorization + Business Logic)                │
│                                                                          │
│  ✓ User record (synced from Keycloak on first login)                   │
│  ✓ Organizations (created/managed in Rails)                             │
│  ✓ Organization memberships (who belongs to which org)                  │
│  ✓ Roles (admin/manager/member per org)                                 │
│  ✓ Projects, repos, events, settings                                    │
│  ✓ "What can this person do?"                                           │
│                                                                          │
│  ✗ Does NOT handle login/passwords                                      │
│  ✗ Does NOT issue tokens                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### First Login → Organization Assignment

When a new user logs in for the first time:

```ruby
# app/services/user_sync_service.rb
class UserSyncService
  def sync_from_keycloak(token_claims)
    user = User.find_or_initialize_by(keycloak_sub: token_claims['sub'])
    
    user.update!(
      email: token_claims['email'],
      name: token_claims['name'],
      avatar_url: token_claims['picture']
    )
    
    # Optional: Auto-assign to org based on email domain
    if user.organization_memberships.empty?
      auto_assign_organization(user)
    end
    
    user
  end
  
  private
  
  def auto_assign_organization(user)
    domain = user.email.split('@').last
    
    # Map domains to default organizations
    org = case domain
          when 'example.com'
            Organization.find_by(slug: 'dual-boot-partners')
          when 'partner.example.com'
            Organization.find_by(slug: 'fueled')
          end
    
    if org
      OrganizationMembership.create!(
        user: user,
        organization: org,
        role: 'member'  # Default role, admin can upgrade
      )
    end
  end
end
```

**Alternative:** Invite-only membership (no auto-assignment based on domain)

---

## 3.5 Temporal Workflow Orchestration

Temporal provides durable workflow orchestration for complex, long-running, or compliance-critical processes. It serves as a platform capability that can support multiple workflow types.

### Architecture Boundaries

```mermaid
flowchart TB
    subgraph Capture["1. Ingestion/Capture Layer"]
        Telemetry["Telemetry Controller"]
        Webhooks["Webhook Controller"]
        AIProxy["AI Proxy Controller"]
        SyncJobs["Sync Jobs"]
    end

    subgraph Orchestration["2. Orchestration Layer (Temporal)"]
        TemporalServer["Temporal Server"]
        
        subgraph Workflows["Workflows"]
            SanitizationWF["Ingestion Sanitization"]
            ApprovalWF["Approval Workflows"]
            ProvisioningWF["Provisioning"]
            BillingWF["Billing/Metering"]
        end
        
        subgraph Activities["Activities"]
            Classify["Classification"]
            Sanitize["Sanitization"]
            Persist["Persistence"]
            Audit["Audit Logging"]
            Alert["Alerting"]
        end
    end

    subgraph Persistence["3. Persistence Layer"]
        RawStore["MinIO: raw-events<br/>(encrypted, 24h TTL)"]
        PrimaryDB["TimescaleDB<br/>(sanitized hypertable)"]
        AuditLog["PostgreSQL<br/>(audit_logs)"]
    end

    subgraph Alerting["4. Alerting/Incident Layer"]
        AlertRouter["Alert Router"]
        Escalation["Escalation Queue"]
        IncidentMgmt["Incident Management"]
    end

    %% Ingestion flows
    Telemetry -->|"raw event"| TemporalServer
    Webhooks -->|"raw event"| TemporalServer
    AIProxy -->|"raw event"| TemporalServer
    SyncJobs -->|"raw event"| TemporalServer

    %% Workflow execution
    TemporalServer --> SanitizationWF
    SanitizationWF --> Classify
    Classify --> Sanitize
    Sanitize --> Persist
    Persist --> Audit

    %% Persistence
    Classify -->|"temp store"| RawStore
    Persist -->|"sanitized data"| PrimaryDB
    Audit -->|"audit records"| AuditLog

    %% Alerting
    Classify -->|"high risk"| Alert
    Alert --> AlertRouter
    AlertRouter --> Escalation
    Escalation --> IncidentMgmt
```

### Workflow #1: Ingestion Sanitization + Governance

This is the primary workflow that ensures all ingested data is sanitized before persistence.

#### Data Lifecycle Walkthrough

```mermaid
sequenceDiagram
    autonumber
    participant Source as Data Source<br/>(IDE, Webhook, API)
    participant Rails as Rails API
    participant Temporal as Temporal Server
    participant Worker as Temporal Worker
    participant MinIO as MinIO<br/>(raw-events bucket)
    participant TSDB as TimescaleDB<br/>(tool_events hypertable)
    participant Audit as PostgreSQL<br/>(audit_logs)
    participant Alert as Alert Router

    Source->>Rails: Ingest event/prompt
    Rails->>MinIO: PUT encrypted payload (24h TTL)
    Rails->>Temporal: Start IngestionSanitizationWorkflow<br/>{minio_key, source, org_id}
    
    Note over Temporal,Worker: Workflow Execution

    Temporal->>Worker: Execute ClassificationActivity
    Worker->>MinIO: GET raw payload
    Worker->>Worker: Detect sensitive data<br/>(PII, secrets, HIPAA)
    Worker-->>Temporal: Classification result<br/>{labels, confidence, risk_level}

    alt High Risk or Low Confidence
        Temporal->>Worker: Execute AlertActivity
        Worker->>Alert: Send escalation signal
        Alert-->>Worker: Escalation acknowledged
        Note over Alert: Human review may be required
    end

    Temporal->>Worker: Execute SanitizationActivity
    Worker->>Worker: Apply sanitization rules<br/>(redact, mask, tokenize)
    Worker-->>Temporal: Sanitized payload

    Temporal->>Worker: Execute PersistenceActivity
    Worker->>TSDB: INSERT sanitized event<br/>(auto-partitioned)
    Worker-->>Temporal: Persistence confirmed

    Temporal->>Worker: Execute AuditActivity
    Worker->>Audit: INSERT audit record<br/>{minio_key, actions, policy_version}
    Worker-->>Temporal: Audit complete

    Temporal->>MinIO: DELETE raw payload
    Temporal-->>Rails: Workflow complete<br/>{event_id, audit_id}
```

#### Workflow Outputs

| Output | Description | Storage |
|--------|-------------|---------|
| **Classification Labels** | What was detected (e.g., `pii:email`, `secret:api_key`, `hipaa:patient_id`) | PostgreSQL: `audit_logs` |
| **Sanitized Payload** | Safe-to-store version with sensitive data redacted/masked/tokenized | TimescaleDB: `tool_events` hypertable |
| **Audit Metadata** | What happened, when, by what policy version, what was changed | PostgreSQL: `audit_logs` |
| **Escalation Signals** | Triggered when confidence < threshold or risk level = critical | Alert router |
| **Raw Event** | Original encrypted payload (temporary) | MinIO: `raw-events` bucket (auto-deleted after 24h) |

#### Classification Labels

```yaml
Detected Artifacts:
  pii:
    - email
    - phone_number
    - name
    - address
    - ssn
  secrets:
    - api_key
    - password
    - private_key
    - access_token
    - connection_string
  hipaa:
    - patient_id
    - diagnosis
    - treatment
    - medical_record_number
  financial:
    - credit_card
    - bank_account
    - routing_number
```

#### Sanitization Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Redact** | Replace with `[REDACTED]` | Secrets, passwords |
| **Mask** | Partial visibility (`***@email.com`) | Emails, phone numbers |
| **Tokenize** | Replace with reversible token | PII that may need recovery |
| **Hash** | One-way hash for correlation | IDs that need deduplication |
| **Remove** | Delete entirely | HIPAA data in non-compliant contexts |

#### Workflow Configuration

```ruby
# temporal/workflows/ingestion_sanitization_workflow.rb
class IngestionSanitizationWorkflow < Temporal::Workflow
  def execute(raw_event_id:, source:, org_id:)
    # Step 1: Classification
    classification = workflow.execute_activity(
      ClassificationActivity,
      { raw_event_id: raw_event_id },
      start_to_close_timeout: 30.seconds,
      retry_policy: { max_attempts: 3 }
    )

    # Step 2: Escalation (if needed)
    if classification[:risk_level] == 'critical' || classification[:confidence] < 0.8
      workflow.execute_activity(
        AlertActivity,
        { classification: classification, org_id: org_id },
        start_to_close_timeout: 10.seconds
      )
      
      # Optionally wait for human approval
      if classification[:risk_level] == 'critical'
        workflow.wait_for_signal('approval_received', timeout: 24.hours)
      end
    end

    # Step 3: Sanitization
    sanitized = workflow.execute_activity(
      SanitizationActivity,
      { raw_event_id: raw_event_id, classification: classification },
      start_to_close_timeout: 60.seconds
    )

    # Step 4: Persistence
    persisted = workflow.execute_activity(
      PersistenceActivity,
      { sanitized_payload: sanitized, org_id: org_id },
      start_to_close_timeout: 30.seconds
    )

    # Step 5: Audit
    workflow.execute_activity(
      AuditActivity,
      { 
        raw_event_id: raw_event_id,
        sanitized_event_id: persisted[:event_id],
        classification: classification,
        policy_version: PolicyVersion.current
      },
      start_to_close_timeout: 10.seconds
    )

    { event_id: persisted[:event_id], status: 'sanitized' }
  end
end
```

### Future Workflow Candidates

Adding Temporal enables these additional workflow patterns:

| Workflow | Description | Triggers |
|----------|-------------|----------|
| **Connector OAuth Flow** | Durable OAuth state machine with retry/refresh handling | User initiates connector setup |
| **Data Export/GDPR** | Orchestrate user data export with sanitization and delivery | User requests data export |
| **Billing & Metering** | Aggregate usage, apply pricing rules, generate invoices | Scheduled (daily/monthly) |
| **Anomaly Remediation** | Detect anomalies → alert → await approval → apply fix | Anomaly detection triggers |
| **Onboarding Provisioning** | Multi-step org setup: create resources, configure integrations, notify | New org created |

### Docker Compose Configuration

```yaml
# docker-compose.yml (key services)

# PostgreSQL with TimescaleDB extension
postgres:
  image: timescale/timescaledb:latest-pg16
  environment:
    POSTGRES_USER: db90
    POSTGRES_PASSWORD: db90_password
    POSTGRES_DB: db90_development
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
  command: >
    postgres
      -c shared_preload_libraries=timescaledb
      -c timescaledb.telemetry_level=off
      -c max_connections=200

# MinIO for raw event quarantine
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"   # S3 API
    - "9001:9001"   # Web console
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 5s
    timeout: 5s
    retries: 5

# Temporal workflow orchestration
# Note: Temporal uses its own databases (temporal + temporal_visibility) on the same PostgreSQL instance
# The auto-setup image creates these automatically on first run
temporal:
  image: temporalio/auto-setup:latest
  environment:
    - DB=postgresql
    - DB_PORT=5432
    - POSTGRES_USER=temporal
    - POSTGRES_PWD=temporal_password
    - POSTGRES_SEEDS=postgres
    # Auto-setup creates 'temporal' and 'temporal_visibility' databases
  depends_on:
    - postgres
  ports:
    - "7233:7233"

temporal-ui:
  image: temporalio/ui:latest
  environment:
    - TEMPORAL_ADDRESS=temporal:7233
  ports:
    - "8088:8080"
  depends_on:
    - temporal

temporal-worker:
  build:
    context: ./temporal
    dockerfile: Dockerfile
  environment:
    - TEMPORAL_ADDRESS=temporal:7233
    - DATABASE_URL=postgres://db90:db90_password@postgres:5432/db90_development
    - MINIO_ENDPOINT=http://minio:9000
    - MINIO_ACCESS_KEY=minioadmin
    - MINIO_SECRET_KEY=minioadmin
  depends_on:
    - temporal
    - postgres
    - minio

volumes:
  postgres_data:
  minio_data:
```

---

## 4. API Routes Diagram

All routes are prefixed with `/api/v1` and follow Rails RESTful conventions.

```mermaid
flowchart LR
    subgraph Public["Public Routes"]
        Health["GET /health"]
        TelemetryIngest["POST /telemetry/*"]
    end

    subgraph AuthRequired["Auth Required (JWT)"]
        subgraph UserRoutes["Users"]
            UsersMe["GET /users/me"]
            UsersUpdate["PATCH /users/me"]
            UsersActivity["GET /users/me/activity"]
            UsersStats["GET /users/me/stats"]
        end

        subgraph OrgRoutes["Organizations"]
            OrgsList["GET /organizations"]
            OrgsCreate["POST /organizations"]
            OrgsShow["GET /organizations/:id"]
            OrgsUpdate["PATCH /organizations/:id"]
            OrgsMembers["GET /organizations/:id/members"]
            OrgsAddMember["POST /organizations/:id/members"]
            OrgsRemoveMember["DELETE /organizations/:id/members/:mid"]
            OrgsProjects["GET /organizations/:id/projects"]
            OrgsStats["GET /organizations/:id/stats"]
            OrgsSettings["GET/PATCH /organizations/:id/settings"]
            OrgsRetention["GET/PATCH /organizations/:id/retention_policy"]
        end

        subgraph ProjectRoutes["Projects"]
            ProjectsList["GET /projects"]
            ProjectsCreate["POST /projects"]
            ProjectsShow["GET /projects/:id"]
            ProjectsUpdate["PATCH /projects/:id"]
            ProjectsDelete["DELETE /projects/:id"]
            ProjectsMembers["GET /projects/:id/members"]
            ProjectsAddMember["POST /projects/:id/members"]
            ProjectsRepos["GET /projects/:id/repositories"]
            ProjectsAddRepo["POST /projects/:id/repositories"]
            ProjectsStats["GET /projects/:id/stats"]
            ProjectsSync["POST /projects/:id/sync"]
            ProjectsSettings["GET/PATCH /projects/:id/settings"]
        end

        subgraph EventRoutes["Events"]
            EventsStream["GET /events/stream (SSE)"]
            EventsList["GET /events"]
            EventsShow["GET /events/:id"]
            EventsCreate["POST /events"]
            EventsSummary["GET /events/summary"]
        end

        subgraph StatsRoutes["Stats"]
            StatsOverview["GET /stats/overview"]
            StatsUsage["GET /stats/usage"]
            StatsUsageHourly["GET /stats/usage/hourly"]
            StatsUsageDaily["GET /stats/usage/daily"]
        end

        subgraph SettingsRoutes["Settings"]
            UserSettings["GET/PATCH /settings/user"]
        end
    end

    subgraph AdminOnly["Admin Only"]
        subgraph ConnectorRoutes["Connectors"]
            ConnectorsList["GET /connectors"]
            ConnectorsShow["GET /connectors/:tool"]
            ConnectorsUpdate["PATCH /connectors/:tool"]
            ConnectorsTest["POST /connectors/:tool/test"]
            ConnectorsOAuth["GET /connectors/:tool/oauth"]
        end

        subgraph AdminUsers["User Management"]
            AdminUsersList["GET /admin/users"]
            AdminUsersShow["GET /admin/users/:id"]
            AdminUsersUpdate["PATCH /admin/users/:id"]
        end
    end

    subgraph Telemetry["Telemetry (Token Auth)"]
        TelemetryCursor["POST /telemetry/cursor"]
        TelemetryCursorBatch["POST /telemetry/cursor/batch"]
        TelemetryClaudeCode["POST /telemetry/claude-code"]
        TelemetryClaudeCodeBatch["POST /telemetry/claude-code/batch"]
        TelemetryOpenCode["POST /telemetry/opencode"]
        TelemetryOpenCodeBatch["POST /telemetry/opencode/batch"]
    end

    subgraph AIGateway["AI Gateway (OpenRouter Proxy)"]
        AICompletions["POST /ai/completions"]
        AIChat["POST /ai/chat"]
        AIModels["GET /ai/models"]
    end

    subgraph Webhooks["Webhooks (Signature Verified)"]
        WebhookGitHub["POST /webhooks/github"]
        WebhookGitLab["POST /webhooks/gitlab"]
        WebhookBitbucket["POST /webhooks/bitbucket"]
        WebhookJira["POST /webhooks/jira"]
        WebhookLinear["POST /webhooks/linear"]
    end
```

### API Route Summary

| Category | Endpoints | Auth | Description |
|----------|-----------|------|-------------|
| **Users** | 4 | Required | Current user profile, activity, stats |
| **Organizations** | 10 | Required | Org CRUD, members, projects, settings |
| **Projects** | 12 | Required | Project CRUD, members, repos, sync |
| **Events** | 5 | Required | Tool events, SSE stream, summary |
| **Stats** | 3 | Required | Overview, ledger aggregations |
| **Settings** | 1 | Required | User preferences |
| **Connectors** | 8 | Admin | Org-level tool connectors (GitHub, GitLab, etc.) |
| **Tool Accounts** | 5 | Required | User tool account linking (list, create, delete, oauth_url, oauth_callback) |
| **AI Gateway** | 3 | Required | OpenRouter proxy for AI completions |
| **Admin** | 3 | Admin | User management |
| **Telemetry** | 6 | Token | IDE telemetry (Cursor, Claude Code, OpenCode) |
| **Webhooks** | 5 | Signature | Incoming webhooks from external tools |

### Rails Routes Configuration

```ruby
# config/routes.rb
Rails.application.routes.draw do
  get '/health', to: 'health#show'

  namespace :api do
    namespace :v1 do
      # Current user
      resource :user, only: [:show, :update] do
        get :activity
        get :stats
        # User's tool accounts (for current org context)
        resources :tool_accounts, only: [:index, :create, :destroy] do
          member do
            get :oauth_url
            post :oauth_callback
          end
        end
      end

      # Organizations
      resources :organizations do
        resources :members, only: [:index, :create, :destroy] do
          member do
            get :tool_accounts  # View member's linked accounts
          end
        end
        resources :projects, only: [:index]
        resource :settings, only: [:show, :update]
        resource :retention_policy, only: [:show, :update]
        get :stats
        
        # Org-level connectors (admin only)
        resources :connectors, only: [:index, :show, :create, :update, :destroy], param: :connector_type do
          member do
            post :test
            get :oauth_url
            post :oauth_callback
            post :sync  # Trigger manual sync
          end
        end
      end

      # Projects (standalone or nested)
      resources :projects do
        resources :members, only: [:index, :create, :destroy]
        resources :repositories, only: [:index, :create, :destroy]
        resource :settings, only: [:show, :update]
        post :sync
        get :stats
      end

      # Repositories
      resources :repositories, only: [:index, :show] do
        get :events
      end

      # Events
      resources :events, only: [:index, :show, :create] do
        collection do
          get :stream  # SSE/WebSocket endpoint
          get :summary
          get :unattributed  # Events without user attribution
        end
      end

      # Stats (queries TimescaleDB continuous aggregates)
      namespace :stats do
        get :overview
        get :usage           # Combined usage stats
        get 'usage/hourly'   # Hourly aggregate data
        get 'usage/daily'    # Daily aggregate data
      end

      # User settings
      resource :settings, only: [:show, :update]

      # Admin namespace
      namespace :admin do
        resources :users, only: [:index, :show, :update]
        resources :organizations, only: [:index, :show]
      end

      # AI Gateway (OpenRouter proxy)
      namespace :ai do
        post 'completions'  # OpenAI-compatible completions
        post 'chat'         # Chat completions
        get 'models'        # List available models for current org
      end
    end
  end

  # Telemetry (token auth - user's personal API token)
  namespace :telemetry do
    post 'cursor'
    post 'cursor/batch'
    post 'claude-code'
    post 'claude-code/batch'
    post 'opencode'
    post 'opencode/batch'
  end

  # Webhooks (signature verification)
  namespace :webhooks do
    post 'github'
    post 'gitlab'
    post 'bitbucket'
    post 'jira'
    post 'linear'
  end
end
```

---

## 5. Data Flow Diagram

```mermaid
flowchart TB
    subgraph VCS["Version Control (Org Connectors)"]
        GitHub["GitHub API"]
        GitLab["GitLab API"]
        Bitbucket["Bitbucket API"]
    end

    subgraph PM["Project Management (Org Connectors)"]
        Jira["Jira API"]
        Linear["Linear API"]
        GHProjects["GitHub Projects"]
    end

    subgraph AI["AI Providers (Org-Level)"]
        OpenRouter["OpenRouter API"]
        Anthropic["Anthropic API"]
        OpenAI["OpenAI API"]
        Gemini["Gemini API"]
    end

    subgraph IDETelemetry["IDE Telemetry (User Push)"]
        CursorIDE["Cursor"]
        ClaudeCode["Claude Code"]
        OpenCode["OpenCode"]
    end

    subgraph Ingestion["1. Ingestion/Capture Layer"]
        subgraph SidekiqJobs["Sidekiq Jobs"]
            GitHubSyncJob["GitHubSyncJob"]
            GitLabSyncJob["GitLabSyncJob"]
            BitbucketSyncJob["BitbucketSyncJob"]
            JiraSyncJob["JiraSyncJob"]
            LinearSyncJob["LinearSyncJob"]
            AIUsageSyncJob["AIUsageSyncJob"]
        end
        TelemetryController["TelemetryController"]
        WebhookController["WebhookController"]
        AIProxyController["AIProxyController"]
    end

    subgraph TemporalLayer["2. Orchestration Layer (Temporal)"]
        TemporalServer["Temporal Server"]
        SanitizationWF["Ingestion Sanitization<br/>Workflow"]
        
        subgraph Activities["Activities"]
            Classify["Classify"]
            Sanitize["Sanitize"]
            Persist["Persist"]
            AuditAct["Audit"]
        end
    end

    subgraph Storage["3. Persistence Layer"]
        subgraph MinIOStore["MinIO (S3)"]
            RawStore["raw-events bucket<br/>(encrypted, 24h TTL)"]
        end
        subgraph TimescaleDB["PostgreSQL + TimescaleDB"]
            ToolEvent["timeseries.tool_events<br/>(hypertable)"]
            HourlyAgg["hourly_token_usage<br/>(continuous aggregate)"]
            DailyAgg["daily_token_usage<br/>(continuous aggregate)"]
        end
        AuditLog["audit_logs"]
        Repository["repositories"]
    end

    subgraph AlertLayer["4. Alerting Layer"]
        AlertRouter["Alert Router"]
        Escalation["Escalation Queue"]
    end

    subgraph RailsAPI["Rails API Layer"]
        StatsController["StatsController"]
        EventsController["EventsController"]
        ProjectsController["ProjectsController"]
        ActionCable["ActionCable"]
    end

    subgraph Frontend["React SPA"]
        Overview["Overview Dashboard"]
        UserStats["User Stats"]
        ProjectStats["Project Stats"]
        LiveFeed["Live Event Feed"]
    end

    %% VCS sync flows → Temporal
    GitHub -->|"webhooks"| WebhookController
    GitHub -->|"polling"| GitHubSyncJob
    GitLab -->|"webhooks"| WebhookController
    GitLab -->|"polling"| GitLabSyncJob
    Bitbucket -->|"webhooks"| WebhookController
    Bitbucket -->|"polling"| BitbucketSyncJob

    %% PM sync flows → Temporal
    Jira -->|"webhooks"| WebhookController
    Jira -->|"polling"| JiraSyncJob
    Linear -->|"webhooks"| WebhookController
    Linear -->|"polling"| LinearSyncJob
    GHProjects -->|"via GitHub"| GitHubSyncJob

    %% AI proxy flows → Temporal
    AIProxyController -->|"proxy"| OpenRouter
    AIProxyController -->|"proxy"| Anthropic
    AIProxyController -->|"proxy"| OpenAI
    AIProxyController -->|"proxy"| Gemini

    %% AI Analytics → Temporal
    OpenRouter -->|"usage API"| AIUsageSyncJob
    Anthropic -->|"usage API"| AIUsageSyncJob
    OpenAI -->|"usage API"| AIUsageSyncJob
    Gemini -->|"usage API"| AIUsageSyncJob

    %% Telemetry → Temporal
    CursorIDE -->|"POST /telemetry"| TelemetryController
    ClaudeCode -->|"POST /telemetry"| TelemetryController
    OpenCode -->|"POST /telemetry"| TelemetryController

    %% ALL ingestion routes through Temporal for sanitization
    WebhookController -->|"raw event"| RawStore
    WebhookController -->|"start workflow"| TemporalServer
    TelemetryController -->|"raw event"| RawStore
    TelemetryController -->|"start workflow"| TemporalServer
    AIProxyController -->|"raw event"| RawStore
    AIProxyController -->|"start workflow"| TemporalServer
    GitHubSyncJob -->|"raw event"| RawStore
    GitHubSyncJob -->|"start workflow"| TemporalServer
    GitLabSyncJob -->|"raw event"| RawStore
    GitLabSyncJob -->|"start workflow"| TemporalServer
    BitbucketSyncJob -->|"raw event"| RawStore
    BitbucketSyncJob -->|"start workflow"| TemporalServer
    JiraSyncJob -->|"start workflow"| TemporalServer
    LinearSyncJob -->|"start workflow"| TemporalServer
    AIUsageSyncJob -->|"start workflow"| TemporalServer

    %% Repository upserts (no sanitization needed)
    GitHubSyncJob -->|"upsert"| Repository
    GitLabSyncJob -->|"upsert"| Repository
    BitbucketSyncJob -->|"upsert"| Repository

    %% Temporal workflow execution
    TemporalServer --> SanitizationWF
    SanitizationWF --> Classify
    Classify --> Sanitize
    Sanitize --> Persist
    Persist --> AuditAct

    %% Workflow reads raw, writes sanitized
    Classify -->|"read"| RawStore
    Persist -->|"sanitized event"| ToolEvent
    AuditAct -->|"audit record"| AuditLog
    Classify -->|"high risk"| AlertRouter
    AlertRouter --> Escalation

    %% Cleanup after workflow
    SanitizationWF -->|"delete raw"| RawStore

    %% TimescaleDB automatic aggregation (no job needed)
    ToolEvent -->|"auto-refresh"| HourlyAgg
    HourlyAgg -->|"auto-refresh"| DailyAgg

    %% Real-time broadcast (after sanitization complete)
    SanitizationWF -->|"broadcast"| ActionCable

    %% API reads (aggregates for stats, raw for recent events)
    ToolEvent --> EventsController
    ToolEvent --> ProjectsController
    HourlyAgg --> StatsController
    DailyAgg --> StatsController
    Repository --> ProjectsController
    AuditLog --> EventsController

    %% Frontend consumption
    StatsController --> Overview
    EventsController --> LiveFeed
    StatsController --> UserStats
    ProjectsController --> ProjectStats
    ActionCable --> LiveFeed
```

### Data Flow Details

**All ingested data flows through the Temporal Ingestion Sanitization Workflow before persistence.**

| Source | Level | Event Types | Ingestion Method | Sanitization |
|--------|-------|-------------|------------------|--------------|
| **GitHub** | Org | `commit`, `pull_request`, `push`, `issue` | Webhook + Polling | ✅ Temporal |
| **GitLab** | Org | `commit`, `merge_request`, `push`, `issue` | Webhook + Polling | ✅ Temporal |
| **Bitbucket** | Org | `commit`, `pull_request`, `push` | Webhook + Polling | ✅ Temporal |
| **Jira** | Org | `issue`, `issue_update`, `sprint`, `worklog` | Webhook + Polling | ✅ Temporal |
| **Linear** | Org | `issue`, `issue_update`, `sprint` | Webhook + Polling | ✅ Temporal |
| **GitHub Projects** | Org | `issue`, `issue_update` | Via GitHub sync | ✅ Temporal |
| **OpenRouter** | Org | `api_call`, `completion`, tokens, cost | Real-time proxy + Hourly sync | ✅ Temporal |
| **Anthropic** | Org | `api_call`, `completion`, tokens, cost | Real-time proxy + Hourly sync | ✅ Temporal |
| **OpenAI** | Org | `api_call`, `completion`, tokens, cost | Real-time proxy + Hourly sync | ✅ Temporal |
| **Gemini** | Org | `api_call`, `completion`, tokens, cost | Real-time proxy + Hourly sync | ✅ Temporal |
| **Cursor** | User | `session_*`, `completion`, tokens | Real-time POST | ✅ Temporal |
| **Claude Code** | User | `conversation_*`, `message`, `tool_use`, `loop_*` | Real-time POST | ✅ Temporal |
| **OpenCode** | User | `conversation_*`, `message`, `tool_use` | Real-time POST | ✅ Temporal |

### Ingestion → Persistence Data Lifecycle

```
1. CAPTURE     → Raw event received (controller/job)
2. STORE       → Encrypted in MinIO raw-events bucket (24h lifecycle)
3. WORKFLOW    → Temporal IngestionSanitizationWorkflow started
4. CLASSIFY    → Detect PII, secrets, HIPAA data (read from MinIO)
5. ALERT       → Escalate if high risk/low confidence
6. SANITIZE    → Apply redaction/masking/tokenization
7. PERSIST     → INSERT into TimescaleDB tool_events hypertable (auto-partitioned)
8. AUDIT       → INSERT into PostgreSQL audit_logs
9. CLEANUP     → DELETE from MinIO (or let 24h TTL handle it)
10. BROADCAST  → Notify via ActionCable (sanitized event only)
11. AGGREGATE  → TimescaleDB auto-refreshes continuous aggregates (hourly/daily)
```

### OpenRouter: Dual-Purpose Integration

OpenRouter is unique among connectors - it provides **both** real-time API gateway and background sync:

#### Real-Time API Gateway

```
Client App → POST /api/v1/ai/completions → Rails API → OpenRouter API → AI Provider
                                              ↓
                                        ToolEvent created instantly
                                        (tokens, cost, model, user, project)
```

**Gateway Endpoints:**
- `POST /api/v1/ai/completions` - Chat completions (OpenAI-compatible)
- `POST /api/v1/ai/chat` - Alternative chat endpoint
- `GET /api/v1/ai/models` - List available models for the org

**Gateway Features:**
- Automatic event creation on each API call
- User attribution via JWT token
- Project context passed in request headers
- Model allowlisting per organization
- Rate limiting and cost alerts

#### Background Analytics Sync

```
OpenRouter Usage API → OpenRouterSyncJob → Correlation Engine → ToolEvent
                                                   ↓
                                          Links to: User, Project, Repo, Commit, Activity
```

**Sync Features:**
- Fetches all usage data (including calls made outside DB90 proxy)
- Correlates API calls with team members by metadata/time
- Links usage to projects based on active project context
- Associates with repos/commits based on file paths in prompts
- Builds unified activity timeline (AI calls + dev activity)

### Sidekiq Jobs

| Job | Schedule | Source | Purpose |
|-----|----------|--------|---------|
| `GitHubSyncJob` | Every 15 min | Org Connector | Sync repos, commits, PRs, issues; also syncs GitHub Projects boards and items |
| `GitLabSyncJob` | Every 15 min | Org Connector | Sync repos, commits, MRs, issues |
| `BitbucketSyncJob` | Every 15 min | Org Connector | Sync repos, commits, PRs |
| `JiraSyncJob` | Every 15 min | Org Connector | Sync projects, issues, sprints, worklogs |
| `LinearSyncJob` | Every 15 min | Org Connector | Sync teams, projects, issues, cycles |
| `AIUsageSyncJob` | Hourly | Org Connector | Sync usage from configured AI providers (OpenRouter/Anthropic/OpenAI/Gemini), correlate with users/projects/repos/commits |
| `AttributionJob` | Hourly | - | Match unattributed events to users |
| `CostAlertJob` | Hourly | - | Check cost thresholds, send alerts |
| `OrgRetentionCleanupJob` | Nightly | - | Enforce per-org retention policies (delete data older than org's configured retention) |

### Aggregation Pipeline (TimescaleDB Continuous Aggregates)

```
tool_events (hypertable, auto-partitioned by occurred_at)
    ↓
TimescaleDB auto-refresh (hourly)
    ↓
hourly_token_usage (continuous aggregate)
    ↓
TimescaleDB auto-refresh (daily)
    ↓
daily_token_usage (continuous aggregate)
    ↓
StatsController (efficient queries on pre-aggregated data)
```

*Note: No Sidekiq job needed - TimescaleDB handles aggregation automatically via continuous aggregate refresh policies.*

### Real-Time Streaming

The application supports real-time event streaming via ActionCable (WebSocket):

```
TelemetryController → ActionCable.broadcast → EventsChannel → useEventStream hook → Live UI
```

**Rails Components:**
- **EventsChannel** (`app/channels/events_channel.rb`): ActionCable channel for streaming
- **TelemetryController**: Broadcasts new events after creation

**React Components:**
- **useEventStream** (`src/hooks/useEventStream.ts`): Hook using ActionCable consumer

**Features:**
- WebSocket connection with automatic reconnection
- User-scoped streams (users subscribe to their own events)
- Admin stream for all events
- Heartbeat via ActionCable ping/pong

---

## 6. Implementation Phases

This section outlines the implementation phases for building the DB90 application. Each phase will be broken down into detailed task files in the `docs/phases/` directory.

### Phase Overview

```mermaid
flowchart LR
    P1["Phase 1<br/>Infrastructure"]
    P2["Phase 2<br/>Data Model"]
    P3["Phase 3<br/>Authentication"]
    P4["Phase 4<br/>Core API"]
    P5["Phase 5<br/>Events/Telemetry"]
    P6["Phase 6<br/>Frontend"]

    P1 --> P2 --> P3 --> P4 --> P5 --> P6
```

### Phase 1: Infrastructure Setup

**Goal:** Set up the development environment with all required services.

**Deliverables:**
- [ ] Docker Compose configuration for all services
- [ ] PostgreSQL + TimescaleDB with initial setup
- [ ] Redis instance for Sidekiq
- [ ] MinIO instance with `raw-events` bucket
- [ ] Temporal cluster (server + UI)
- [ ] Temporal worker scaffold
- [ ] Keycloak instance with DB90 realm
- [ ] Google Cloud OAuth credentials (for Keycloak IDP)
- [ ] Rails API scaffold with basic health endpoint
- [ ] Vite + React project scaffold (with shadcn/ui initialized)
- [ ] Makefile with unified dev commands
- [ ] Remove old `packages/shared/` and `packages/worker/` directories
- [ ] GitHub Actions CI workflow scaffold
- [ ] Development scripts (start, stop, logs, reset)

**Key Files:**
- `docker-compose.yml`
- `Dockerfile.api`
- `Dockerfile.web`
- `Dockerfile.temporal-worker`
- `temporal/` - Workflow orchestration package
- `keycloak/realm-export.json` - Realm with Google IDP (example.com)
- `packages/api/` (Rails new)
- `packages/web/` (Vite create)

**Keycloak Setup:**
1. Create Google Cloud OAuth 2.0 credentials
2. Configure realm with Google IDP (`hostedDomain: example.com`)
3. Create `db90-web` client (public, PKCE required)
4. Export realm config for version control

**Temporal Setup:**
1. Configure Temporal server with PostgreSQL persistence
2. Set up Temporal UI for workflow visibility
3. Create temporal-worker Dockerfile with Ruby SDK
4. Verify workflow execution with hello-world test

**MinIO Setup:**
1. Configure MinIO container with persistent volume
2. Create `raw-events` bucket via init script or console
3. Set 24-hour lifecycle policy for auto-expiration
4. Verify S3 API access from Rails container

---

### Phase 2: Data Model

**Goal:** Implement the complete database schema with ActiveRecord models and TimescaleDB hypertables.

**Deliverables:**
- [ ] Enable TimescaleDB extension
- [ ] Create `public` schema migrations (relational data)
- [ ] Create `timeseries` schema with hypertables
- [ ] ActiveRecord models with associations
- [ ] Read-only models for continuous aggregates
- [ ] Model validations and callbacks
- [ ] Database seeds for development
- [ ] Model specs (RSpec)

**PostgreSQL Enums (retention policies):**
- `raw_event_ttl`: `6_hours`, `12_hours`, `24_hours`, `48_hours`, `72_hours`
- `tool_events_retention`: `30_days`, `60_days`, `90_days`, `180_days`, `365_days`, `730_days`
- `hourly_aggregate_retention`: `90_days`, `180_days`, `365_days`, `730_days`
- `daily_aggregate_retention`: `365_days`, `730_days`, `1095_days`, `forever`

**Relational Models (public schema):**
- User
- Organization, OrganizationMembership, OrganizationSetting
- OrganizationRetentionPolicy (configurable retention per org with enum columns)
- OrganizationConnector (GitHub, GitLab, Bitbucket, Jira, Linear, OpenRouter, Anthropic, OpenAI, Gemini)
- UserToolAccount (user's linked accounts, scoped per org)
- Project, ProjectMembership, ProjectSetting
- UserSetting
- Repository
- AuditLog (sanitization workflow audit trail)
- AdminAuditLog (admin panel action history)
- SanitizationPolicy (versioned sanitization rules)

**TimescaleDB Models (timeseries schema):**
- ToolEvent (hypertable, partitioned by `occurred_at`, 1-day chunks)
- HourlyTokenUsage (continuous aggregate, auto-refreshed hourly)
- DailyTokenUsage (continuous aggregate, auto-refreshed daily)

**TimescaleDB Policies (system-wide ceiling):**
- Compression policy: compress chunks older than 7 days
- Retention policy: drop tool_event chunks older than 730 days (max enum value)
- Retention policy: drop hourly aggregates older than 730 days (max enum value)
- *Note: Per-org retention enforced by OrgRetentionCleanupJob*

**Services:**
- RetentionService (merges defaults + org overrides)
- RawEventStore (MinIO S3 client wrapper)

**Sidekiq Jobs:**
- OrgRetentionCleanupJob (nightly, deletes per org's configured retention)

---

### Phase 3: Authentication

**Goal:** Implement Keycloak-based authentication for both API and frontend.

**Deliverables:**
- [ ] Keycloak realm fully configured (Google IDP, client, flows)
- [ ] Rails JWT validation middleware (via JWKS)
- [ ] User sync service (Keycloak claims → User record)
- [ ] Auto-assign org membership by email domain (optional)
- [ ] React auth context and hooks (PKCE flow)
- [ ] Protected route wrapper
- [ ] Login/logout flow
- [ ] Token refresh handling
- [ ] Org context header (`X-Organization-ID`)

**Key Files:**
- `keycloak/realm-export.json`
- `packages/api/config/initializers/keycloak.rb` - JWKS config
- `packages/api/app/middleware/jwt_auth.rb` - Token validation
- `packages/api/app/services/user_sync_service.rb` - Sync + org assignment
- `packages/web/src/lib/auth.ts` - Keycloak OIDC client
- `packages/web/src/contexts/AuthContext.tsx` - Auth state
- `packages/web/src/contexts/OrgContext.tsx` - Current org context

**Keycloak Notes:**
- Google IDP with `hostedDomain: example.com`
- No custom code needed for Phase 1-2
- Add second Google IDP for @partner.example.com when ready (Phase 2)

---

### Phase 4: Core API

**Goal:** Implement all CRUD endpoints for core entities.

**Deliverables:**
- [ ] Users controller (profile, settings, tool accounts)
- [ ] Organizations controller (CRUD, members, settings, retention policy)
- [ ] Organization connectors controller (CRUD, OAuth flows, test/sync)
- [ ] User tool accounts controller (link/unlink accounts per org)
- [ ] Projects controller (CRUD, members, repos, settings)
- [ ] Repositories controller
- [ ] Settings controller
- [ ] Request/response serializers
- [ ] Authorization (Action Policy with org context)
- [ ] API specs (RSpec)

**Key Patterns:**
- Versioned API (`/api/v1/`)
- JSON:API or ActiveModel Serializers
- Action Policy for authorization (multi-tenant context, pre-checks, caching)
- Pagination with Kaminari
- OAuth flow helpers for external tools
- rswag for OpenAPI spec generation (enables TypeScript type generation)

**Global Admin Panel (Administrate):**
- [ ] Install and configure Administrate gem
- [ ] Admin routes in `config/routes/admin_routes.rb` (alphabetical order)
- [ ] `Admin::ApplicationController` with global admin auth + audit logging
- [ ] Dashboards: `OrganizationDashboard`, `UserDashboard`, `ProjectDashboard`
- [ ] Dashboards: `OrganizationConnectorDashboard`, `OrganizationRetentionPolicyDashboard`
- [ ] Dashboards: `ToolEventDashboard`, `AuditLogDashboard`, `AdminAuditLogDashboard`, `SanitizationPolicyDashboard`
- [ ] Admin controllers with batch_delete, export, impersonate actions
- [ ] Custom admin CSS styling
- [ ] Admin dashboard with system stats
- [ ] Admin specs (RSpec)

---

### Phase 5: Events, Telemetry, and Workflow Orchestration

**Goal:** Implement event ingestion with sanitization workflows, storage, aggregation, and real-time streaming.

**Deliverables:**
- [ ] Events controller (CRUD, summary, unattributed, audit trail)
- [ ] Telemetry controller (Cursor, Claude Code, OpenCode)
- [ ] Webhooks controller (GitHub, GitLab, Bitbucket, Jira, Linear)
- [ ] AI Gateway controller (proxy - completions, chat, models)
- [ ] Stats controller (overview, usage aggregates)
- [ ] ActionCable EventsChannel
- [ ] Sidekiq sync jobs for each connector type
- [ ] Connector service classes (API clients)
- [ ] Attribution service (match events to users)
- [ ] Cost calculation service

**Temporal Workflows:**
- [ ] `IngestionSanitizationWorkflow` - classify, sanitize, persist, audit
- [ ] Classification activity (detect PII, secrets, HIPAA data)
- [ ] Sanitization activity (redact, mask, tokenize)
- [ ] Persistence activity (write to tool_events)
- [ ] Audit activity (write to audit_logs)
- [ ] Alert activity (escalation routing)
- [ ] Temporal worker configuration
- [ ] Sanitization policy versioning

**Sidekiq Jobs:**
- `GitHubSyncJob` - repos, PRs, commits, issues, Projects → starts Temporal workflow
- `GitLabSyncJob` - repos, MRs, commits, issues → starts Temporal workflow
- `BitbucketSyncJob` - repos, PRs, commits → starts Temporal workflow
- `JiraSyncJob` - projects, issues, sprints, worklogs → starts Temporal workflow
- `LinearSyncJob` - teams, projects, issues, cycles → starts Temporal workflow
- `AIUsageSyncJob` - sync usage, correlate → starts Temporal workflow
- `AttributionJob` - match unattributed events to users
- `CostAlertJob` - check thresholds, send alerts

*Note: Aggregation is handled automatically by TimescaleDB continuous aggregates - no Sidekiq job required.*
*Note: `RawEventCleanupJob` removed - MinIO lifecycle policy handles 24h expiration automatically.*

**Services:**
- `AIProxyService` - Unified AI gateway that proxies requests to configured providers and creates events
- `AICorrelationService` - Matches usage data with users, projects, repos, commits, activity
- Connector-specific clients: `OpenRouterClient`, `AnthropicClient`, `OpenAIClient`, `GeminiClient`

---

### Phase 6: Frontend

**Goal:** Build the React SPA with all dashboard views.

**Deliverables:**
- [ ] Vite environment configuration (`.env.development`, `.env.production`)
  - `VITE_API_BASE_URL` - Rails API endpoint
  - `VITE_KEYCLOAK_URL` - Keycloak server URL
  - `VITE_KEYCLOAK_REALM` - Keycloak realm (db90)
  - `VITE_KEYCLOAK_CLIENT_ID` - Public client ID
  - `VITE_ACTIONCABLE_URL` - WebSocket endpoint for real-time
- [ ] API client with auth interceptor
- [ ] shadcn/ui setup and base components (Button, Card, Dialog, Table, Form, etc.)
- [ ] Layout components (nav, sidebar, org switcher)
- [ ] Dashboard/Overview page
- [ ] Organizations pages (list, detail, settings)
- [ ] Organization connectors page (connect GitHub, GitLab, etc.)
- [ ] Projects pages (list, detail, settings)
- [ ] User profile and settings
- [ ] User tool account linking (connect personal GitHub, etc.)
- [ ] Activity heatmap component
- [ ] Usage charts (Recharts/Chart.js)
- [ ] Live event feed with ActionCable
- [ ] Unattributed events review page
- [ ] Admin pages (users, orgs)

**Key Libraries:**
- React Router
- TanStack Query (React Query)
- shadcn/ui (Radix UI primitives + Tailwind)
- Tailwind CSS
- ActionCable consumer
- Recharts or Chart.js
- React Hook Form
- Lucide React (icons)

---

### Phase Dependencies

| Phase | Depends On | Can Parallelize With |
|-------|------------|---------------------|
| 1. Infrastructure | - | - |
| 2. Data Model | Phase 1 | - |
| 3. Authentication | Phase 1 | Phase 2 |
| 4. Core API | Phases 2, 3 | - |
| 5. Events/Telemetry/Workflows | Phase 1 (Temporal), Phase 4 | Phase 6 (partial) |
| 6. Frontend | Phases 3, 4 | Phase 5 (partial) |

---

## Verification Checklist

**Diagrams & Documentation:**
- [ ] Render Mermaid diagrams in VS Code or GitHub
- [ ] Cross-reference ERD with `packages/api/db/schema.rb`
- [ ] Cross-reference API routes with `packages/api/config/routes.rb`

**Monorepo & Tooling:**
- [ ] Verify `make setup` installs all dependencies (api, web, temporal)
- [ ] Verify `make up` starts all Docker services
- [ ] Verify `make test` runs both api and web tests
- [ ] Verify `make generate-types` creates TypeScript types from OpenAPI
- [ ] Verify old `packages/shared/` and `packages/worker/` are removed
- [ ] Verify GitHub Actions CI runs on PR

**Infrastructure:**
- [ ] Verify Docker Compose starts all services (web, api, sidekiq, temporal, temporal-ui, temporal-worker, keycloak, postgres, minio, redis)
- [ ] Verify Keycloak realm configuration with Google IDP
- [ ] Verify Google Cloud OAuth credentials are configured
- [ ] Verify Temporal server is running and accessible
- [ ] Verify Temporal UI is accessible at port 8088
- [ ] Verify Temporal worker connects and registers workflows

**TimescaleDB:**
- [ ] Verify TimescaleDB extension is enabled (`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`)
- [ ] Verify `timeseries.tool_events` is a hypertable (`SELECT * FROM timescaledb_information.hypertables`)
- [ ] Verify compression policy is active
- [ ] Verify retention policy is active
- [ ] Verify continuous aggregates refresh on schedule
- [ ] Verify `hourly_token_usage` returns pre-computed data
- [ ] Verify `daily_token_usage` returns pre-computed data

**MinIO:**
- [ ] Verify MinIO is accessible at port 9000 (S3 API) and 9001 (Console)
- [ ] Verify `raw-events` bucket exists
- [ ] Verify lifecycle policy is configured (default 24h, respects max org setting)
- [ ] Verify Rails can write/read/delete objects via aws-sdk-s3
- [ ] Verify objects auto-expire per lifecycle policy

**Retention Policies:**
- [ ] Verify retention enum types created in PostgreSQL
- [ ] Verify OrganizationRetentionPolicy table exists with enum columns
- [ ] Verify default retention values applied when org has no policy
- [ ] Verify org can update retention via API (enum validation)
- [ ] Verify RetentionService returns correct values per org
- [ ] Verify OrgRetentionCleanupJob runs and respects org settings
- [ ] Verify retention changes are audited (updated_by, updated_at)
- [ ] Verify Admin UI displays retention options as dropdowns
- [ ] Verify Admin UI shows current retention settings per org

**Connectors:**
- [ ] GitHub connector OAuth flow works
- [ ] GitLab connector OAuth flow works
- [ ] Bitbucket connector OAuth flow works
- [ ] Jira connector OAuth flow works
- [ ] Linear connector OAuth flow works
- [ ] OpenRouter API key configuration works
- [ ] Anthropic API key configuration works (if using direct)
- [ ] OpenAI API key configuration works (if using direct)
- [ ] Gemini API key configuration works (if using direct)

**Telemetry:**
- [ ] Cursor telemetry ingestion works
- [ ] Claude Code telemetry ingestion works
- [ ] OpenCode telemetry ingestion works

**Temporal Workflows:**
- [ ] IngestionSanitizationWorkflow executes end-to-end
- [ ] Classification activity detects PII correctly
- [ ] Classification activity detects secrets correctly
- [ ] Classification activity detects HIPAA data correctly
- [ ] Sanitization activity redacts sensitive data
- [ ] High-risk events trigger escalation alerts
- [ ] Low-confidence classifications trigger alerts
- [ ] Audit records include policy version
- [ ] Raw events are deleted after workflow completion
- [ ] Workflow failures retry correctly
- [ ] Temporal UI shows workflow history

**Webhooks:**
- [ ] GitHub webhook signature verification works
- [ ] GitLab webhook signature verification works
- [ ] Bitbucket webhook signature verification works
- [ ] Jira webhook signature verification works
- [ ] Linear webhook signature verification works

**AI Providers (test each configured provider):**
- [ ] OpenRouter proxy creates events on API calls
- [ ] Anthropic direct proxy creates events on API calls
- [ ] OpenAI direct proxy creates events on API calls
- [ ] Gemini direct proxy creates events on API calls
- [ ] AI usage sync correlates with users/projects/repos/commits
- [ ] Model allowlisting enforced per provider
- [ ] Rate limiting works per provider
- [ ] Cost alerts trigger correctly

**Global Admin Panel (Administrate):**
- [ ] Admin routes accessible at `/admin`
- [ ] Global admin authentication required (non-admin users denied)
- [ ] Admin dashboard displays system stats
- [ ] Organizations CRUD works with batch_delete, export
- [ ] Users CRUD works with impersonate, suspend, reset_password
- [ ] Projects CRUD works with batch_delete, export
- [ ] Organization connectors shows all connectors with force_sync, revoke
- [ ] Audit logs are read-only with export
- [ ] Tool events are read-only with export
- [ ] Sanitization policies CRUD with activate/deactivate
- [ ] All admin actions logged to admin_audit_logs
- [ ] Impersonation creates audit trail and works correctly
- [ ] Export to CSV works for all resources
- [ ] Admin routes are in alphabetical order (verify sidebar)
- [ ] Custom styling applied (matches brand)

---

## Next Steps

To begin implementation, create detailed task files for each phase:

```
docs/phases/
├── phase-1-infrastructure.md      # Docker, PostgreSQL, Redis, Temporal, Keycloak
├── phase-2-data-model.md          # ActiveRecord models, migrations
├── phase-3-authentication.md      # Keycloak OIDC, JWT validation
├── phase-4-core-api.md            # REST endpoints, authorization
├── phase-5-events-telemetry.md    # Ingestion, Temporal workflows, sanitization
└── phase-6-frontend.md            # React SPA, components, auth
```

Each phase file should contain:
1. Detailed task breakdown with checkboxes
2. File-by-file implementation notes
3. Test requirements
4. Acceptance criteria

**Note:** Temporal is established in Phase 1 but workflow implementation occurs in Phase 5. The `IngestionSanitizationWorkflow` is the first concrete workflow, but Temporal is designed as a platform capability for future workflows.
