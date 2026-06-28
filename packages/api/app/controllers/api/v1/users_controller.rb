# frozen_string_literal: true

module Api
  module V1
    class UsersController < BaseController
      ALLOWED_THEMES = %w[light dark system].freeze
      NOTIFICATION_KEYS = %w[
        notify_in_app_risk notify_in_app_cost
        notify_email_digest notify_email_alerts
        notify_cost_alert notify_token_alert notify_retention_warning notify_risk_alert
      ].freeze

      # GET /api/v1/users/me
      def me
        current_user.user_settings.load
        response_data = UserSerializer.new(current_user).serialize

        # Include impersonation info if this is an impersonation request
        if request.env["jwt.impersonation"]
          response_data[:impersonation] = {
            active: true,
            impersonator_id: request.env["jwt.impersonator_id"],
            impersonator_email: request.env["jwt.impersonator_email"]
          }
        end

        # Add debug info for development
        if Rails.env.development?
          response_data[:_debug] = {
            user_id: current_user.id,
            keycloak_sub: current_user.keycloak_sub,
            email: current_user.email,
            total_events: ToolEvent.where(user_id: current_user.id).count,
            jwt_sub: request.env["jwt.claims"]&.dig("sub"),
            jwt_email: request.env["jwt.claims"]&.dig("email")
          }
        end

        render json: { data: response_data }
      end

      # PATCH /api/v1/users/me
      def update
        authorize! current_user, to: :update?

        if current_user.update(user_params)
          current_user.user_settings.load
          render_resource(current_user, UserSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(current_user.errors)
          }, status: :unprocessable_content
        end
      end

      # GET /api/v1/users/me/favorites
      def favorites
        projects = authorized_scope(current_user.favorited_projects)
                                   .pluck(:id, :name)
                                   .map { |id, name| { id:, name: } }
        render json: { data: projects }
      end

      # GET /api/v1/users/me/organizations
      def organizations
        authorize! current_user, to: :organizations?

        orgs = paginate(current_user.organizations.order(:name))
        render json: {
          data: ::OrganizationWithMembershipSerializer.new(orgs, params: { user: current_user }).serialize,
          meta: pagination_meta(orgs)
        }
      end

      # GET /api/v1/users/me/settings
      def settings
        authorize! current_user, to: :settings?

        settings = current_user.user_settings.order(:key)
        render json: {
          data: UserSettingSerializer.new(settings).serialize
        }
      end

      # GET /api/v1/users/me/tool_accounts
      # Requires X-Organization-ID. Lists ingest-capable accounts for the current membership only.
      def tool_accounts
        authorize! current_user, to: :tool_accounts?
        require_organization!
        return unless current_organization

        membership = current_user.organization_memberships.find_by!(organization: current_organization)
        accounts = membership.user_tool_accounts
                               .where(tool_name: UserToolAccount::INGEST_TOOLS)
                               .order(:tool_name)

        last_used_by_tool = ToolEvent
          .where(
            organization_id: current_organization.id,
            user_id: current_user.id,
            tool_name: UserToolAccount::INGEST_TOOLS
          )
          .group(:tool_name)
          .maximum(:occurred_at)

        render json: {
          data: MeToolAccountMetadataSerializer.new(
            accounts,
            params: { last_used_by_tool: last_used_by_tool }
          ).serialize
        }
      end

      # PUT /api/v1/users/me/settings/:key
      def update_setting
        authorize! current_user, to: :settings?

        if (error = validate_setting_value(params[:key], params[:value]))
          return render json: {
            error: "Unprocessable Entity",
            errors: { value: [ error ] }
          }, status: :unprocessable_content
        end

        setting = current_user.user_settings.find_or_initialize_by(key: params[:key])
        setting.value = params[:value]

        if setting.save
          render_resource(setting, UserSettingSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(setting.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/users/me/settings/:key
      def destroy_setting
        authorize! current_user, to: :settings?

        setting = current_user.user_settings.find_by!(key: params[:key])
        setting.destroy!
        render_no_content
      end

      # POST /api/v1/users/me/stop_impersonation
      def stop_impersonation
        authorize! current_user, to: :stop_impersonation?

        unless request.env["jwt.impersonation"]
          return render json: { error: "Not in impersonation mode" }, status: :bad_request
        end

        claims = request.env["jwt.claims"]

        unless claims["jti"].present?
          return render json: { error: "Token missing jti claim" }, status: :unprocessable_content
        end

        ImpersonationService.revoke_token(claims["jti"], claims["exp"])

        impersonator = User.find_by(id: request.env["jwt.impersonator_id"])

        ImpersonationAuditService.log_ended(user: current_user, actor: impersonator, request: request)

        render json: { data: { success: true } }
      end

      private

      def user_params
        params.permit(:name, :avatar_url)
      end

      # Returns an error string for invalid values, or nil if the value is acceptable.
      # Unknown keys pass through without validation — the settings store is intentionally open-ended.
      def validate_setting_value(key, value)
        case key
        when "theme"
          "must be one of: light, dark, system" unless ALLOWED_THEMES.include?(value)
        when "default_org_id"
          "must be a valid organization you belong to" unless current_user.organizations.exists?(id: value)
        when *NOTIFICATION_KEYS
          "must be true or false" unless %w[true false].include?(value)
        end
      end
    end
  end
end
