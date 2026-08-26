# frozen_string_literal: true

module Admin
  class ApplicationController < Administrate::ApplicationController
    include ActionController::Cookies
    include ActionController::RequestForgeryProtection
    include AdminContentSecurityPolicy

    layout "admin/application"

    protect_from_forgery with: :exception

    before_action :prevent_admin_page_caching
    before_action :authenticate_admin!
    before_action :log_admin_action, only: [ :create, :update, :destroy ]

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

    # Overrides Administrate's default so a blocked delete always shows a reason.
    # requested_resource.errors can be empty when a *nested* association (e.g. a
    # project's tool_events) is what blocked the destroy — the restrict_with_error
    # failure is recorded on that nested record, not on requested_resource itself.
    def destroy
      if requested_resource.destroy
        flash[:notice] = translate_with_resource("destroy.success")
      else
        messages = requested_resource.errors.full_messages
        messages = [ "Cannot delete #{resource_name.to_s.humanize.downcase}: it has related records that could not be removed." ] if messages.empty?
        flash[:error] = messages.join("<br/>")
      end
      redirect_to after_resource_destroyed_path(requested_resource), status: :see_other
    end

    private

    # Avoid bfcache / intermediary caches serving an authenticated admin page after
    # cross-surface logout cleared the session cookie (Back button).
    def prevent_admin_page_caching
      response.headers["Cache-Control"] = "no-store"
    end

    def authenticate_admin!
      unless current_admin_user&.global_admin?
        respond_to do |format|
          format.html { redirect_to login_path(redirect: admin_login_path) }
          format.json { render json: { error: "Forbidden" }, status: :forbidden }
        end
      end
    end

    def authenticate_from_jwt
      token = cookies[:admin_token] || request.headers["Authorization"]&.sub(/^Bearer /, "")
      return nil unless token

      claims = Keycloak::JwtVerifier.verify(token)
      return nil unless claims

      User.find_by(keycloak_sub: claims["sub"])
    rescue StandardError
      nil
    end

    def log_admin_action
      return unless current_admin_user

      AdminAuditLog.log_action(
        admin_user:      current_admin_user,
        action:          action_name,
        resource:        admin_audit_log_resource,
        tracked_changes: filtered_params,
        request:         request
      )
    end

    def admin_audit_log_resource
      return resource_class.new unless params[:id].present?

      resource_class.find_by(id: params[:id]) || resource_class.new(id: params[:id])
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
