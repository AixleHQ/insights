# frozen_string_literal: true

module Admin
  class ApplicationController < Administrate::ApplicationController
    include ActionController::Cookies
    include ActionController::RequestForgeryProtection

    layout 'admin/application'

    protect_from_forgery with: :exception

    before_action :authenticate_admin!
    before_action :log_admin_action, only: [:create, :update, :destroy]

    helper_method :current_admin_user
    helper ActionView::Helpers::NumberHelper

    def current_admin_user
      @current_admin_user ||= begin
        # Check signed cookie first (from admin login)
        if cookies.signed[:admin_user_id]
          User.find_by(id: cookies.signed[:admin_user_id])
        else
          # Fall back to JWT from header/cookie
          authenticate_from_jwt
        end
      end
    end

    private

    def authenticate_admin!
      unless current_admin_user&.global_admin?
        respond_to do |format|
          format.html do
            if Rails.env.development? || Rails.env.test?
              redirect_to '/admin/login'
            else
              render plain: 'Forbidden: Global admin access required', status: :forbidden
            end
          end
          format.json { render json: { error: 'Forbidden' }, status: :forbidden }
        end
      end
    end

    def authenticate_from_jwt
      # Try to get JWT from cookie or Authorization header
      token = cookies[:admin_token] || request.headers['Authorization']&.sub(/^Bearer /, '')
      return nil unless token

      # Decode and validate JWT (simplified - in production use proper JWT validation)
      claims = decode_jwt(token)
      return nil unless claims

      User.find_by(keycloak_sub: claims['sub'])
    rescue StandardError
      nil
    end

    def decode_jwt(token)
      # Simplified JWT decode - in production use proper validation with Keycloak
      payload, = JWT.decode(token, nil, false)
      payload
    rescue JWT::DecodeError
      nil
    end

    def log_admin_action
      return unless current_admin_user

      AdminAuditLog.create!(
        admin_user: current_admin_user,
        action: action_name,
        resource_type: resource_class.name,
        resource_id: params[:id],
        tracked_changes: filtered_params,
        ip_address: request.remote_ip,
        user_agent: request.user_agent
      )
    rescue StandardError => e
      Rails.logger.error "Failed to log admin action: #{e.message}"
    end

    def filtered_params
      params.to_unsafe_h.except(:authenticity_token, :_method, :controller, :action)
    end

    def order
      @order ||= Administrate::Order.new(
        params.fetch(resource_name, {}).fetch(:order, default_sorting[:order]),
        params.fetch(resource_name, {}).fetch(:direction, default_sorting[:direction])
      )
    end

    def default_sorting
      { order: :created_at, direction: :desc }
    end

    # Override Administrate's pagination to use standard :page param instead of :_page
    def paginate_resources(resources)
      resources.page(params[:page]).per(records_per_page)
    end
  end
end
