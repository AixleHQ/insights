# frozen_string_literal: true

module IngestTokenAuthentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_by_token!
    before_action :authorize_contribution!
  end

  private

  def authenticate_by_token!
    auth_header = request.headers["Authorization"]
    raw = auth_header&.start_with?("Bearer ") ? auth_header.delete_prefix("Bearer ").strip : nil
    @tool_account = raw.present? ? UserToolAccount.find_by_ingest_token(raw) : nil

    unless ingest_token_authorized?
      render json: { error: "Unauthorized" }, status: :unauthorized
    end
  end

  def ingest_token_authorized?
    return false unless @tool_account&.organization&.is_active?
    return true if @tool_account.active?

    # Ingest tools are allowed through while waiting_for_connection so the first
    # ingested event can auto-activate the account (see IngestController#activate_tool_account_if_needed!).
    # Non-ingest tools (e.g. GitHub Copilot) must be explicitly activated before ingesting.
    @tool_account.ingest_tool? && @tool_account.waiting_for_connection?
  end

  # Only Owners and Members may contribute usage data. A token can outlive a
  # downgrade to Viewer, so the org role is re-checked on every request
  # rather than trusted from token issuance time (post-AIX-503).
  def authorize_contribution!
    return if performed?
    return if @tool_account.organization_membership&.can_manage_projects?

    render json: { error: "Forbidden", code: "viewer_cannot_contribute" }, status: :forbidden
  end

  def accessible_projects
    @accessible_projects ||= Project.active
                                    .where(organization_id: @tool_account.organization.id)
                                    .or(Project.active.where(owner_id: @tool_account.user.id))
  end
end
