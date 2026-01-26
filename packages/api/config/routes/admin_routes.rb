# frozen_string_literal: true

# Admin routes (Administrate)
# In API-only mode, we must manually define all routes including :new and :edit
namespace :admin do
  # Session routes
  get 'login', to: 'sessions#new'
  post 'login', to: 'sessions#create'
  delete 'logout', to: 'sessions#destroy'
  get 'logout', to: 'sessions#destroy'

  # Read-only resources with export
  resources :admin_audit_logs, only: [:index, :show] do
    collection do
      get :export
    end
  end
  resources :audit_logs, only: [:index, :show] do
    collection do
      get :export
    end
  end
  resources :tool_events, only: [:index, :show] do
    collection do
      get :export
    end
  end

  # Full CRUD - manually define to include new/edit in API-only mode
  # Use standard Rails route naming: new_admin_resource, edit_admin_resource
  %w[organizations organization_connectors organization_memberships
     organization_retention_policies projects project_memberships
     repositories sanitization_policies users user_tool_accounts].each do |res|
    singular = res.singularize
    get res, to: "#{res}#index", as: res.to_sym
    get "#{res}/export", to: "#{res}#export"
    post "#{res}/batch_delete", to: "#{res}#batch_delete"
    get "#{res}/new", to: "#{res}#new"
    post res, to: "#{res}#create"
    get "#{res}/:id", to: "#{res}#show", as: singular.to_sym
    get "#{res}/:id/edit", to: "#{res}#edit"
    patch "#{res}/:id", to: "#{res}#update"
    put "#{res}/:id", to: "#{res}#update"
    delete "#{res}/:id", to: "#{res}#destroy"
  end

  # Special user actions
  post 'users/:id/impersonate', to: 'users#impersonate'

  # Special connector actions
  post 'organization_connectors/:id/force_sync', to: 'organization_connectors#force_sync', as: :force_sync_organization_connector
  post 'organization_connectors/:id/revoke', to: 'organization_connectors#revoke', as: :revoke_organization_connector

  # Special sanitization policy actions
  post 'sanitization_policies/:id/activate', to: 'sanitization_policies#activate', as: :activate_sanitization_policy
  post 'sanitization_policies/:id/deactivate', to: 'sanitization_policies#deactivate', as: :deactivate_sanitization_policy

  root to: 'home#index'
end

# Add the new/edit route names outside the namespace with proper naming
scope path: '/admin', module: 'admin' do
  %w[organizations organization_connectors organization_memberships
     organization_retention_policies projects project_memberships
     repositories sanitization_policies users user_tool_accounts].each do |res|
    singular = res.singularize
    get "#{res}/new", to: "#{res}#new", as: :"new_admin_#{singular}"
    get "#{res}/:id/edit", to: "#{res}#edit", as: :"edit_admin_#{singular}"
    get "#{res}/export", to: "#{res}#export", as: :"export_admin_#{res}"
    post "#{res}/batch_delete", to: "#{res}#batch_delete", as: :"batch_delete_admin_#{res}"
  end

  # Special user actions
  post 'users/:id/impersonate', to: 'users#impersonate', as: :impersonate_admin_user
end
