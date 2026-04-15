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
      post "users/me/stop_impersonation", to: "users#stop_impersonation"

      # Organization routes
      resources :organizations do
        member do
          get :retention_policy
          patch :retention_policy, action: :update_retention_policy
          get :settings
          put "settings/:key", action: :update_setting
          delete "settings/:key", action: :destroy_setting
        end

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

        # Organization audit logs
        resources :audit_logs, controller: "organization_audit_logs", only: [ :index ]

        # Organization connectors
        resources :connectors, controller: "organization_connectors" do
          member do
            post :test
            post :sync
            get  :available_repos
            get  :available_projects
          end
          collection do
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
            get :summary
            get :unattributed
          end
          member do
            get :audit_trail
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

        # AI Gateway
        scope "ai/:provider" do
          post "completions", to: "ai_gateway#completions"
          post "chat", to: "ai_gateway#chat"
          get "models", to: "ai_gateway#models"
        end
      end

      # Webhooks (outside organization scope, uses connector_id)
      post "webhooks/:provider/:connector_id", to: "webhooks#receive"

      # Public ingest endpoint — Bearer token auth, no JWT/org context
      post "ingest/events", to: "ingest#create"

      # Project routes (can be accessed outside org context for personal projects)
      resources :projects, except: [ :index, :create ] do
        member do
          get :settings
          put "settings/:key", action: :update_setting
          delete "settings/:key", action: :destroy_setting
          get :stats
          get "stats/daily_by_tool", action: :daily_by_tool
          get "stats/commits_by_user", action: :commits_by_user
          get :members
          get :retention_policy
          patch :retention_policy, action: :update_retention_policy
          post :link_jira
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
