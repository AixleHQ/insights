# frozen_string_literal: true

module IngestTokenAuthentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_by_token!
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
    return false unless @tool_account&.organization.present?
    return true if @tool_account.active?

    @tool_account.ingest_tool? && @tool_account.waiting_for_connection?
  end

  def accessible_projects
    @accessible_projects ||= Project.active
                                    .where(organization_id: @tool_account.organization.id)
                                    .or(Project.active.where(owner_id: @tool_account.user.id))
  end
end
