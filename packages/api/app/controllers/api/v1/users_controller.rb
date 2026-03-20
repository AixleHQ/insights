# frozen_string_literal: true

module Api
  module V1
    class UsersController < BaseController
      # GET /api/v1/users/me
      def me
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
          render_resource(current_user, UserSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(current_user.errors)
          }, status: :unprocessable_entity
        end
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

      # PUT /api/v1/users/me/settings/:key
      def update_setting
        authorize! current_user, to: :settings?

        setting = current_user.user_settings.find_or_initialize_by(key: params[:key])
        setting.value = params[:value]

        if setting.save
          render_resource(setting, UserSettingSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(setting.errors)
          }, status: :unprocessable_entity
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
        unless request.env["jwt.impersonation"]
          return render json: { error: "Not in impersonation mode" }, status: :bad_request
        end

        impersonator = User.find_by(id: request.env["jwt.impersonator_id"])

        ImpersonationAuditService.log_ended(user: current_user, actor: impersonator, request: request)

        render json: { data: { success: true } }
      end

      private

      def user_params
        params.permit(:name, :avatar_url)
      end
    end
  end
end
