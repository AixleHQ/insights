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

    unless @tool_account&.is_active? && @tool_account.organization.present?
      render json: { error: "Unauthorized" }, status: :unauthorized
    end
  end

  def accessible_projects
    @accessible_projects ||= Project.active
                                    .where(organization_id: @tool_account.organization.id)
                                    .or(Project.active.where(owner_id: @tool_account.user.id))
  end
end
