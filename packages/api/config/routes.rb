Rails.application.routes.draw do
  # Health check endpoint
  get "health", to: "health#show"
  get "up" => "rails/health#show", as: :rails_health_check

  # API routes
  namespace :api do
    namespace :v1 do
      # User routes
      get 'users/me', to: 'users#me'
      patch 'users/me', to: 'users#update'
      get 'users/me/organizations', to: 'users#organizations'
      get 'users/me/settings', to: 'users#settings'
      put 'users/me/settings/:key', to: 'users#update_setting'
      delete 'users/me/settings/:key', to: 'users#destroy_setting'

      # Organization routes
      resources :organizations do
        member do
          get :retention_policy
          patch :retention_policy, action: :update_retention_policy
          get :settings
          put 'settings/:key', action: :update_setting
          delete 'settings/:key', action: :destroy_setting
        end

        # Organization members
        resources :members, controller: 'organization_members'

        # Organization connectors
        resources :connectors, controller: 'organization_connectors' do
          member do
            post :test
            post :sync
          end
          collection do
            get 'authorize/:type', action: :authorize_url
            post :callback
          end
        end

        # User tool accounts (scoped to current user's membership)
        resources :tool_accounts, controller: 'user_tool_accounts'

        # Organization projects
        resources :projects, only: [:index, :create]
      end

      # Project routes (can be accessed outside org context for personal projects)
      resources :projects, except: [:index, :create] do
        member do
          get :settings
          put 'settings/:key', action: :update_setting
          delete 'settings/:key', action: :destroy_setting
        end

        # Project members
        resources :members, controller: 'project_members'

        # Project repositories
        resources :repositories do
          member do
            post :sync
          end
        end
      end

      # Personal projects index
      get 'projects', to: 'projects#index'
      post 'projects', to: 'projects#create'
    end
  end

  # Draw admin routes from separate file
  draw :admin_routes
end
