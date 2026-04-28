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
      cost = event.cost_usd.to_f
      if cost > 1.0 then "high"
      elsif cost > 0.1 then "medium"
      elsif cost > 0.01 then "low"
      else "none"
      end
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
  end
end
