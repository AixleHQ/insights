class ApplicationController < ActionController::API
  include ActionController::HttpAuthentication::Token::ControllerMethods

  before_action :authenticate_user!
  before_action :set_current_organization
  before_action :set_active_storage_url_options

  attr_reader :current_user, :current_organization

  protected

  def authenticate_user!
    claims = request.env["jwt.claims"]

    unless claims
      render_unauthorized("Authentication required")
      return
    end

    @current_user = UserSyncService.sync_from_claims(claims)
    @jwt_claims = claims
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error "[Auth] User sync failed: #{e.message}"
    render_unauthorized("User sync failed")
  end

  def set_current_organization
    return unless current_user

    org_id = request.headers["X-Organization-ID"]
    return unless org_id.present?

    @current_organization = current_user.organizations.find_by(id: org_id)

    unless @current_organization
      render json: { error: "Organization not found or access denied" }, status: :forbidden
      return
    end

    unless @current_organization.is_active?
      render json: { error: "Organization inactive or access denied" }, status: :forbidden
    end
  end

  def require_organization!
    return if current_organization

    render json: { error: "Organization context required", message: "Please provide X-Organization-ID header" }, status: :bad_request
  end

  def require_organization_role!(*roles)
    require_organization!
    return unless current_organization

    membership = current_user.organization_memberships.find_by(organization: current_organization)
    unless membership && roles.map(&:to_s).include?(membership.role)
      render json: { error: "Insufficient permissions" }, status: :forbidden
    end
  end

  def require_global_admin!
    unless current_user&.global_admin?
      render json: { error: "Global admin access required" }, status: :forbidden
    end
  end

  def skip_authentication
    # Can be called from before_action to skip auth for specific actions
    @skip_auth = true
  end

  private

  def set_active_storage_url_options
    ActiveStorage::Current.url_options = active_storage_url_options
  end

  def active_storage_url_options
    if ENV["APP_URL"].present?
      uri = URI.parse(ENV["APP_URL"])
      options = { protocol: uri.scheme, host: uri.host }
      options[:port] = uri.port if uri.port && !default_port?(uri.scheme, uri.port)
      return options
    end

    # Local docker dev fallback: Rails sees internal service host (api:3000).
    if Rails.env.development? && request.host == "api"
      return { protocol: "http", host: "localhost", port: 3000 }
    end

    { host: request.base_url }
  rescue URI::InvalidURIError
    { host: request.base_url }
  end

  def default_port?(protocol, port)
    (protocol == "http" && port == 80) || (protocol == "https" && port == 443)
  end

  def render_unauthorized(message = "Unauthorized")
    render json: { error: "Unauthorized", message: message }, status: :unauthorized
  end

  def reject_inactive_organization!(org)
    return if org.nil? || org.is_active?

    render json: { error: "Organization inactive or access denied" }, status: :forbidden
  end
end
