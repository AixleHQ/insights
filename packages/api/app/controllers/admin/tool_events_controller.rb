# frozen_string_literal: true

module Admin
  class ToolEventsController < ApplicationController
    def export
      tool_events = ToolEvent.order(created_at: :desc).limit(10_000)
      respond_to do |format|
        format.csv do
          send_data generate_csv(tool_events), filename: "tool-events-#{Date.current}.csv"
        end
      end
    end

    private

    def generate_csv(tool_events)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id user_id organization_id tool_type event_type created_at]
        tool_events.find_each do |event|
          csv << [ event.id, event.user_id, event.organization_id, event.tool_type, event.event_type, event.created_at ]
        end
      end
    end

    def dashboard_class
      ToolEventDashboard
    end

    def resource_class
      ToolEvent
    end

    def resource_name
      "tool_event"
    end

    def scoped_resource
      resource_class.order(created_at: :desc)
    end
  end
end
