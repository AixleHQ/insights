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

        last_used_by_tool = ToolEvent
          .where(
            organization_id: current_organization.id,
            user_id: current_user.id,
            tool_name: accounts.map(&:tool_name)
          )
          .group(:tool_name)
          .maximum(:occurred_at)

        render json: {
          data: UserToolAccountSerializer.new(
            accounts,
            params: { last_used_by_tool: last_used_by_tool }
          ).serialize
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

        if @tool_account.ingest_tool?
          @tool_account.mark_waiting_for_connection if @tool_account.may_mark_waiting_for_connection?
        elsif @tool_account.may_activate_connection?
          @tool_account.activate_connection
        end

        if @tool_account.save
          log_tool_account!(:create, @tool_account)
          data = UserToolAccountSerializer.new(@tool_account).serialize
          data[:ingestToken] = @tool_account.plaintext_token if @tool_account.plaintext_token
          render json: { data: data }, status: :created
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@tool_account.errors)
          }, status: :unprocessable_content
        end
      end

      # PATCH /api/v1/organizations/:organization_id/tool_accounts/:id
      def update
        authorize! @tool_account

        changes_before = tool_account_audit_snapshot(@tool_account)
        form = Api::V1::UserToolUpdateForm.new(@tool_account)

        if form.update(tool_account_update_params)
          log_tool_account!(:update, @tool_account, changes_before: changes_before)
          render_resource(@tool_account, UserToolAccountSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(form.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/organizations/:organization_id/tool_accounts/:id
      def destroy
        authorize! @tool_account
        snapshot = tool_account_audit_snapshot(@tool_account)
        @tool_account.destroy!
        log_tool_account!(:delete, @tool_account, snapshot: snapshot)
        render_no_content
      end

      # POST /api/v1/organizations/:organization_id/tool_accounts/:id/regenerate_token
      def regenerate_token
        authorize! @tool_account, to: :update?
        @tool_account.rotate_ingest_token!
        log_tool_account!(:regenerate, @tool_account)
        data = UserToolAccountSerializer.new(@tool_account).serialize
        render json: { data: data.merge(ingestToken: @tool_account.plaintext_token) }, status: :ok
      end

      private

      def set_membership
        @membership = current_organization.organization_memberships.find_by!(user: current_user)
      end

      def set_tool_account
        @tool_account = @membership.user_tool_accounts.find(params[:id])
      end

      def tool_account_params
        # connection_state on create is always determined by the state machine per tool type
        params.permit(:tool_name, :access_token, :refresh_token, :token_expires_at,
                      :external_user_id, :external_username)
      end

      def tool_account_update_params
        params.permit(:access_token, :refresh_token, :token_expires_at,
                      :external_user_id, :external_username, :connection_state)
      end

      def tool_account_audit_snapshot(account)
        account.slice(:tool_name, :connection_state, :external_user_id, :external_username)
      end

      def log_tool_account!(verb, account, changes_before: nil, snapshot: nil)
        action = verb == :regenerate ? "tool_account.regenerate" : "tool_account.#{verb}"
        tracked_changes =
          case verb
          when :create
            { after: tool_account_audit_snapshot(account) }
          when :update
            {
              before: changes_before,
              after: tool_account_audit_snapshot(account)
            }
          when :delete
            { before: snapshot }
          when :regenerate
            { tool_name: account.tool_name }
          end

        OrganizationAuditLog.log(
          organization: current_organization,
          actor: current_user,
          action: action,
          resource: account,
          tracked_changes: tracked_changes,
          request: request
        )
      end
    end
  end
end
