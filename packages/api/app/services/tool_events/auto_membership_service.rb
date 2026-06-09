# frozen_string_literal: true

module ToolEvents
  class AutoMembershipService
    def self.call(tool_event)
      new(tool_event).call
    rescue StandardError => e
      error_context = {
        user_id: tool_event&.user_id,
        project_id: tool_event&.project_id,
        tool_event_id: tool_event&.id
      }
      Rails.logger.error("[AutoMembershipService] Unexpected error: #{e.class} #{e.message} #{error_context}")
      Rollbar.error(e, error_context)
      nil
    end

    def initialize(tool_event)
      @tool_event = tool_event
    end

    def call
      return unless eligible?

      ProjectMembership.find_or_create_by!(
        user_id: @tool_event.user_id,
        project_id: @tool_event.project_id
      ) do |m|
        m.role = "viewer"
      end
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
      Rails.logger.warn("[AutoMembershipService] Skipped: #{e.message} " \
                        "(user_id=#{@tool_event.user_id}, project_id=#{@tool_event.project_id})")
    end

    private

    def eligible?
      return false unless @tool_event.user_id.present? && @tool_event.project_id.present?

      candidate_project = project
      return false if candidate_project.nil? || candidate_project.personal?
      return false if org_mismatch?(candidate_project)

      true
    end

    def project
      @project ||= @tool_event.project
    end

    def org_mismatch?(candidate_project)
      return true if @tool_event.organization_id.blank? || candidate_project.organization_id.blank?

      @tool_event.organization_id != candidate_project.organization_id
    end
  end
end
