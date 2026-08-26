# frozen_string_literal: true

module ToolEvents
  class AutoMembershipService
    def self.call(tool_event)
      call_with(
        user_id: tool_event&.user_id,
        project_id: tool_event&.project_id,
        organization_id: tool_event&.organization_id,
        tool_event_id: tool_event&.id
      )
    end

    # Entry point for bulk paths (BatchConnectorUpsert) that insert events via
    # raw SQL and only have attribute hashes, not ToolEvent instances.
    def self.call_with(user_id:, project_id:, organization_id:, tool_event_id: nil)
      new(user_id:, project_id:, organization_id:).call
    rescue StandardError => e
      error_context = { user_id:, project_id:, tool_event_id: }
      Rails.logger.error("[AutoMembershipService] Unexpected error: #{e.class} #{e.message} #{error_context}")
      Rollbar.error(e, error_context)
      nil
    end

    def initialize(user_id:, project_id:, organization_id:)
      @user_id = user_id
      @project_id = project_id
      @organization_id = organization_id
    end

    def call
      return unless eligible?

      ProjectMembership.find_or_create_by!(
        user_id: @user_id,
        project_id: @project_id
      ) do |m|
        m.role = "viewer"
      end
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
      Rails.logger.warn("[AutoMembershipService] Skipped: #{e.message} " \
                        "(user_id=#{@user_id}, project_id=#{@project_id})")
    end

    private

    def eligible?
      return false unless @user_id.present? && @project_id.present?

      candidate_project = project
      return false if candidate_project.nil? || candidate_project.personal?
      return false if org_mismatch?(candidate_project)
      # Don't resurrect access for a user who left the org (AIX-611): ingested events
      # must not re-create a project membership once org membership is gone.
      return false unless current_org_member?(candidate_project)

      true
    end

    def current_org_member?(candidate_project)
      OrganizationMembership.exists?(
        user_id: @user_id,
        organization_id: candidate_project.organization_id
      )
    end

    def project
      @project ||= Project.find_by(id: @project_id)
    end

    def org_mismatch?(candidate_project)
      return true if @organization_id.blank? || candidate_project.organization_id.blank?

      @organization_id != candidate_project.organization_id
    end
  end
end
