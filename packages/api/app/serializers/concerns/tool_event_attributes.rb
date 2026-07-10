# frozen_string_literal: true

module ToolEventAttributes
  extend ActiveSupport::Concern

  included do
    attribute :input_tokens do |event|
      event.tokens_in
    end

    attribute :output_tokens do |event|
      event.tokens_out
    end

    attribute :cost_cents do |event|
      event.cost_usd ? (event.cost_usd * 100).round : nil
    end

    attribute :risk_level do |event|
      event.canonical_risk_level
    end

    attribute :attribution do |event|
      if event.user_id.present? then "user"
      elsif event.metadata&.dig("reconciled") then "organization"
      else "unknown"
      end
    end

    attribute :security_findings do |_event|
      []
    end

    attribute :correlation_method do |event|
      event.metadata&.dig("correlation_method")
    end

    attribute :correlation_confidence do |event|
      event.metadata&.dig("correlation_confidence")
    end

    attribute :jira_ticket do |event|
      event.metadata&.dig("jira_ticket")
    end

    attribute :pr_number do |event|
      event.metadata&.dig("pr_number")
    end

    attribute :pr_url do |event|
      event.metadata&.dig("pr_url")
    end

    attribute :branch do |event|
      event.metadata&.dig("branch") || event.metadata&.dig("branch_name")
    end

    attribute :suggested_user do |event|
      candidate_id = event.metadata&.dig("candidate_user_id")
      next nil unless candidate_id

      user = params[:candidate_users]&.[](candidate_id)
      next nil unless user

      { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url }
    end
  end
end
