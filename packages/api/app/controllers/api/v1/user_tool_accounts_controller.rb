# frozen_string_literal: true

module Api
  module V1
    class UserToolAccountsController < BaseController
      before_action :require_organization!
      before_action :set_membership
      before_action :set_tool_account, only: %i[show update destroy regenerate_token]

      # GET /api/v1/organizations/:organization_id/tool_accounts
      def index
        authorize! @membership, to: :index?, with: UserToolAccountPolicy
        accounts = @membership.user_tool_accounts.order(:tool_name)

        # Allow filtering by tool
        accounts = accounts.by_tool(params[:tool]) if params[:tool].present?
        accounts = accounts.active if params[:active] == "true"

        render json: {
          data: UserToolAccountSerializer.new(accounts).serialize
        }
      end

      # GET /api/v1/organizations/:organization_id/tool_accounts/:id
      def show
        authorize! @tool_account
        render_resource(@tool_account, UserToolAccountSerializer)
      end

      # POST /api/v1/organizations/:organization_id/tool_accounts
      def create
        @tool_account = @membership.user_tool_accounts.new(tool_account_params)
        authorize! @membership, to: :create?, with: UserToolAccountPolicy

        if @tool_account.save
          data = UserToolAccountSerializer.new(@tool_account).serialize
          data[:ingestToken] = @tool_account.plaintext_token if @tool_account.plaintext_token
          render json: { data: data }, status: :created
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@tool_account.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/organizations/:organization_id/tool_accounts/:id
      def update
        authorize! @tool_account

        if @tool_account.update(tool_account_update_params)
          render_resource(@tool_account, UserToolAccountSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@tool_account.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:organization_id/tool_accounts/:id
      def destroy
        authorize! @tool_account
        @tool_account.destroy!
        render_no_content
      end

      # POST /api/v1/organizations/:organization_id/tool_accounts/:id/regenerate_token
      def regenerate_token
        authorize! @tool_account, to: :update?
        raw = "db90_#{SecureRandom.hex(32)}"
        @tool_account.update!(access_token: raw, token_hash: Digest::SHA256.hexdigest(raw))
        data = UserToolAccountSerializer.new(@tool_account).serialize
        render json: { data: data.merge(ingestToken: raw) }, status: :ok
      end

      private

      def set_membership
        @membership = current_organization.organization_memberships.find_by!(user: current_user)
      end

      def set_tool_account
        @tool_account = @membership.user_tool_accounts.find(params[:id])
      end

      def tool_account_params
        params.permit(:tool_name, :access_token, :refresh_token, :token_expires_at,
                      :external_user_id, :external_username, :is_active)
      end

      def tool_account_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_user_id, :external_username, :is_active)
      end
    end
  end
end
