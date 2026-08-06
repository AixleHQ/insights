# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEventFilterable, type: :model do
  let(:host) do
    Class.new do
      include ToolEventFilterable
      public :apply_tool_event_time_filter, :apply_tool_event_risk_level_filter, :apply_tool_event_filters
    end.new
  end
  let(:org)  { create(:organization) }

  # 00:30 UTC on 2024-06-15 = 2024-06-14 20:30 EDT (America/New_York in summer, UTC-4)
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

    context "with tz=America/New_York (EDT, UTC-4 in June)" do
      it "excludes 00:30 UTC (which is 2024-06-14 EDT) when filtering for 2024-06-15" do
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

  describe "#apply_tool_event_filters — search param" do
    # Regression for AIX-589: tool_name is a PostgreSQL enum; ILIKE requires ::text cast.
    # Search was previously client-side (current page only); it is now server-side.
    let(:project) { create(:project, name: "My Git Project", organization: org) }
    let!(:copilot_event)  { create(:tool_event, organization: org, tool_name: "github_copilot") }
    let!(:claude_event)   { create(:tool_event, organization: org, tool_name: "claude_code") }
    let!(:project_event)  { create(:tool_event, organization: org, tool_name: "claude_code", project: project) }

    it "matches tool_name substring case-insensitively (enum cast to text)" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "github" })
      expect(scope).to include(copilot_event)
      expect(scope).not_to include(claude_event)
    end

    it "matches partial tool_name (e.g. 'git' matches 'github_copilot')" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "git" })
      expect(scope).to include(copilot_event)
      expect(scope).not_to include(claude_event)
    end

    it "matches project name substring" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "My Git" })
      expect(scope).to include(project_event)
      expect(scope).not_to include(copilot_event)
    end

    it "is case-insensitive" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "GITHUB" })
      expect(scope).to include(copilot_event)
    end

    it "returns all events when search is blank" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "" })
      expect(scope).to include(copilot_event, claude_event, project_event)
    end

    it "returns no results when search matches nothing" do
      scope = host.apply_tool_event_filters(org.tool_events, { "search" => "zzznomatch" })
      expect(scope).to be_empty
    end

    it "composes with other filters without an ActiveRecord::Relation OR error" do
      scope = host.apply_tool_event_filters(
        org.tool_events,
        { "search" => "git", "event_type" => "chat" }
      )
      # The .or() in the search branch must survive an AND-ed filter appended after it.
      expect { scope.to_a }.not_to raise_error
    end
  end

  describe "#apply_tool_event_risk_level_filter" do
    # Regression coverage for AIX-464: a tool_event re-scanned by Temporal
    # accumulates multiple audit_logs over time. Filtering must key off the
    # single latest one -- the same row ToolEvent#canonical_risk_level displays --
    # not an EXISTS check across the event's full audit_log history.
    let!(:rescanned_event) { create(:tool_event, organization: org) }

    before do
      create(:audit_log, organization: org, tool_event: rescanned_event, risk_level: "medium",
                          created_at: 2.days.ago)
      create(:audit_log, organization: org, tool_event: rescanned_event, risk_level: "critical",
                          created_at: 1.day.ago)
    end

    it "does not match an old audit_log risk_level once a newer scan supersedes it" do
      scope = host.apply_tool_event_risk_level_filter(org.tool_events, "medium")
      expect(scope).not_to include(rescanned_event)
    end

    it "matches the latest audit_log's risk_level" do
      scope = host.apply_tool_event_risk_level_filter(org.tool_events, "critical")
      expect(scope).to include(rescanned_event)
    end

    it "agrees with ToolEvent#canonical_risk_level for every level filtered" do
      %w[none low medium high critical].each do |level|
        scope = host.apply_tool_event_risk_level_filter(org.tool_events, level)
        expect(scope.include?(rescanned_event)).to eq(rescanned_event.canonical_risk_level == level)
      end
    end
  end
end
