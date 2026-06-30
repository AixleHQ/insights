# frozen_string_literal: true

require "rails_helper"

# Dummy host class to test the concern in isolation.
class FilterableHost
  include ToolEventFilterable
  public :apply_tool_event_time_filter
end

RSpec.describe ToolEventFilterable, type: :model do
  let(:host) { FilterableHost.new }
  let(:org)  { create(:organization) }

  # 00:30 UTC on 2024-06-15 = 2024-06-14 20:30 in EST
  let!(:event_midnight_utc) do
    create(:tool_event, organization: org, occurred_at: Time.parse("2024-06-15 00:30:00 UTC"))
  end

  # 12:00 UTC on 2024-06-15 = safely mid-day in both UTC and EST
  let!(:event_noon_utc) do
    create(:tool_event, organization: org, occurred_at: Time.parse("2024-06-15 12:00:00 UTC"))
  end

  describe "#apply_tool_event_time_filter" do
    context "with no tz param (UTC default)" do
      it "includes event at 00:30 UTC when filtering for 2024-06-15 UTC" do
        scope = host.apply_tool_event_time_filter(
          org.tool_events,
          { "start_date" => "2024-06-15", "end_date" => "2024-06-15" }
        )
        expect(scope).to include(event_midnight_utc)
        expect(scope).to include(event_noon_utc)
      end
    end

    context "with tz=America/New_York (UTC-4 in June)" do
      it "excludes 00:30 UTC (which is 2024-06-14 in EST) when filtering for 2024-06-15" do
        scope = host.apply_tool_event_time_filter(
          org.tool_events,
          { "start_date" => "2024-06-15", "end_date" => "2024-06-15", "tz" => "America/New_York" }
        )
        expect(scope).not_to include(event_midnight_utc)
        expect(scope).to include(event_noon_utc)
      end
    end

    context "with an invalid tz value" do
      it "falls back to UTC silently without raising" do
        scope = host.apply_tool_event_time_filter(
          org.tool_events,
          { "start_date" => "2024-06-15", "end_date" => "2024-06-15", "tz" => "Invalid/Zone" }
        )
        expect(scope).to include(event_midnight_utc)
      end
    end

    context "with an empty tz value" do
      it "falls back to UTC silently without raising" do
        scope = host.apply_tool_event_time_filter(
          org.tool_events,
          { "start_date" => "2024-06-15", "end_date" => "2024-06-15", "tz" => "" }
        )
        expect(scope).to include(event_midnight_utc)
      end
    end

    context "without date filters" do
      it "returns all org events" do
        scope = host.apply_tool_event_time_filter(org.tool_events, {})
        expect(scope).to include(event_midnight_utc, event_noon_utc)
      end
    end
  end
end
