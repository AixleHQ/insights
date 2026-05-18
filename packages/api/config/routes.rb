require "sidekiq/web"
require_relative "../lib/admin_constraint"

Rails.application.routes.draw do
  # Health check endpoint
  get "health", to: "health#show"
  get "up" => "rails/health#show", as: :rails_health_check

  # API routes
  namespace :api do
    # Internal API for Temporal workers and other internal services
    scope :internal, controller: "internal" do
      post "tool_events", action: :create_tool_event
      post "audit_logs", action: :create_audit_log
      post "alerts", action: :create_alert
      post "broadcasts", action: :create_broadcast
      get "organizations/:id/sanitization_policy", action: :sanitization_policy
    end

    namespace :v1 do
      # User routes
      get "users/me", to: "users#me"
      patch "users/me", to: "users#update"
      get "users/me/organizations", to: "users#organizations"
      get "users/me/settings", to: "users#settings"
      put "users/me/settings/:key", to: "users#update_setting"
      delete "users/me/settings/:key", to: "users#destroy_setting"
      get   "users/me/personal_settings", to: "user_personal_settings#show"
      patch "users/me/personal_settings", to: "user_personal_settings#update"
      post "users/me/stop_impersonation", to: "users#stop_impersonation"

      # Organization routes
      resources :organizations do
        member do
          get :retention_policy
          patch :retention_policy, action: :update_retention_policy
          get :retention_preview
          get :settings
          put "settings/:key", action: :update_setting
          delete "settings/:key", action: :destroy_setting
          get :model_pricing, to: "model_pricing#index"
        end

        # Pricing overrides (CRUD)
        resources :model_pricing_overrides,
          path: "model_pricing/overrides",
          only: %i[index create update destroy]

        # Organization members
        resources :members, controller: "organization_members" do
          member do
            get :stats
            get :events
          end
        end

        # Organization invitations
        resources :invitations do
          member do
            post :resend
          end
        end

        # Notification routing configuration
        resources :notification_routes, only: %i[index create update destroy]

        # Organization audit logs
        resources :audit_logs, controller: "organization_audit_logs", only: [ :index ]

        # Retention purge logs (compliance evidence)
        resources :retention_logs, controller: "retention_purge_logs", only: [ :index ]

        # Webhook delivery history and retry
        resources :webhook_deliveries, only: [ :index ] do
          member do
            post :retry, action: :retry_action
          end
        end

        # Organization connectors
        resources :connectors, controller: "organization_connectors" do
          member do
            post :test
            post :sync
            get  :available_repos
            get  :available_projects
            get  :sync_status
          end
          collection do
            get :health
            get "authorize/:type", action: :authorize_url
            post :callback
          end
        end

        # User tool accounts (scoped to current user's membership)
        resources :tool_accounts, controller: "user_tool_accounts" do
          member do
            post :regenerate_token
          end
        end

        # Organization projects
        resources :projects, only: [ :index, :create ]

        # Events
        resources :events, only: [ :index, :show ] do
          collection do
            get  :summary
            get  :unattributed
            get  :export
            post :attribute_bulk
          end
          member do
            get  :audit_trail
            post :attribute
          end
        end

        # Async export job status (> 100k row exports)
        resources :event_export_jobs, only: [ :show ] do
          member do
            get :download
          end
        end

        # Telemetry ingestion
        post "telemetry/ingest", to: "telemetry#ingest"
        post "telemetry/batch", to: "telemetry#batch"

        # Stats
        get "stats/overview", to: "stats#overview"
        get "stats/hourly", to: "stats#hourly"
        get "stats/daily", to: "stats#daily"
        get "stats/daily_by_tool", to: "stats#daily_by_tool"
        get "stats/heatmap", to: "stats#heatmap"

        # Tool-scoped stats
        get "stats/tools/:tool_name/overview",    to: "stats#tool_overview"
        get "stats/tools/:tool_name/models",      to: "stats#tool_models"
        get "stats/tools/:tool_name/users",       to: "stats#tool_users"
        get "stats/tools/:tool_name/daily",       to: "stats#tool_daily"
        get "stats/tools/:tool_name/event_types", to: "stats#tool_event_types"

        # AI Gateway
        scope "ai/:provider" do
          post "completions", to: "ai_gateway#completions"
          post "chat", to: "ai_gateway#chat"
          get "models", to: "ai_gateway#models"
        end
      end

      # OpenRouter Broadcast Webhook — receives OTLP per-request traces.
      # Each connector gets a unique webhook_token embedded in the URL for routing.
      # Public endpoint: no Keycloak JWT required.
      # Must be declared before the wildcard webhooks route.
      post "webhooks/openrouter_traces/:webhook_token", to: "openrouter_traces#receive"

      # Webhooks (outside organization scope, uses connector_id)
      post "webhooks/:provider/:connector_id", to: "webhooks#receive"

      # Public ingest endpoint — Bearer token auth, no JWT/org context
      post "ingest/events", to: "ingest#create"

      # MCP integration: exchanges an authenticated OIDC session for a fresh
      # UserToolAccount ingest token. Called once by the MCP client after a
      # successful Keycloak device-flow login (see plan/tasks/07-mcp-auth.md).
      namespace :integrations do
        post "mcp/exchange", to: "mcp#exchange"
      end

      # Project lookup by git remote — Bearer ingest token auth, no JWT.
      # Must be declared before `resources :projects` so "lookup" isn't matched as an :id.
      get "projects/lookup", to: "project_lookup#show"

      # Project routes (can be accessed outside org context for personal projects)
      resources :projects, except: [ :index, :create ] do
        member do
          get :settings
          put "settings/:key", action: :update_setting
          delete "settings/:key", action: :destroy_setting
          get :stats
          get "stats/daily_by_tool", action: :daily_by_tool
          get "stats/commits_by_user", action: :commits_by_user
          get :retention_policy
          patch :retention_policy, action: :update_retention_policy
          post :link_jira
          post :link_linear
          post :sync_issues
        end

        resources :issues, only: [ :index, :show ]

        # Project members
        resources :members, controller: "project_members"

        # Project repositories
        resources :repositories do
          member do
            post :sync
          end
        end

        # Project AI provider connectors
        resources :connectors, controller: "project_connectors" do
          member do
            post :test
            post :sync
          end
        end

        # Project audit logs
        resources :audit_logs, controller: "project_audit_logs", only: [ :index ]
      end

      # Personal projects index
      get "projects", to: "projects#index"
      post "projects", to: "projects#create"

      # Public invitation routes (outside organization scope)
      get "invitations/check", to: "public_invitations#check"
      get "invitations/:token", to: "public_invitations#show"
      post "invitations/:token/accept", to: "public_invitations#accept"
    end
  end

  # ActionCable WebSocket endpoint
  mount ActionCable.server => "/cable"

  # Sidekiq Web UI (protected by admin auth)
  mount Sidekiq::Web => "/admin/sidekiq", constraints: AdminConstraint.new

  # Draw admin routes from separate file
  draw :admin_routes
end
