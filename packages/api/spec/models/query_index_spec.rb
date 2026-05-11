# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Performance indexes", type: :model do
  let(:conn) { ActiveRecord::Base.connection }

  # Checks that an index with the given name exists in the database.
  # For TimescaleDB hypertables the parent index name is stored in
  # pg_indexes on the timeseries schema; chunk-level copies are in
  # _timescaledb_internal but the parent entry is always present.
  def index_exists?(schema, table, index_name)
    conn.execute(<<~SQL).any?
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = '#{schema}'
        AND tablename  = '#{table}'
        AND indexname  = '#{index_name}'
    SQL
  end

  describe "idx_tool_events_org_tool_occurred" do
    it "exists on timeseries.tool_events" do
      expect(index_exists?("timeseries", "tool_events", "idx_tool_events_org_tool_occurred")).to be true
    end

    it "covers organization_id + tool_name + occurred_at columns" do
      result = conn.execute(<<~SQL).first
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'timeseries'
          AND tablename  = 'tool_events'
          AND indexname  = 'idx_tool_events_org_tool_occurred'
      SQL

      expect(result["indexdef"]).to include("organization_id", "tool_name", "occurred_at")
    end

    it "is used for org + tool + date-range queries (no Seq Scan on any chunk)" do
      org = create(:organization)
      create_list(:tool_event, 5, organization: org, tool_name: "claude_code",
                                  occurred_at: 7.days.ago)

      # Disable seq scan so the planner is forced to use an index when one exists.
      # Without this, tiny test datasets always trigger Seq Scan regardless of indexes.
      conn.execute("SET LOCAL enable_seqscan = off")

      query = ToolEvent
        .where(organization_id: org.id, tool_name: "claude_code")
        .where("occurred_at >= ?", 30.days.ago)

      plan_json = conn.execute("EXPLAIN (FORMAT JSON) #{query.to_sql}").first["QUERY PLAN"]
      node_types = extract_node_types(JSON.parse(plan_json))

      expect(node_types).to(
        satisfy("include Index Scan or Index Only Scan") do |types|
          types.include?("Index Scan") || types.include?("Index Only Scan")
        end
      )
    end
  end

  describe "index_audit_logs_on_organization_id_and_created_at" do
    it "exists on public.audit_logs" do
      expect(
        index_exists?("public", "audit_logs", "index_audit_logs_on_organization_id_and_created_at")
      ).to be true
    end

    it "covers organization_id + created_at columns" do
      result = conn.execute(<<~SQL).first
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'audit_logs'
          AND indexname  = 'index_audit_logs_on_organization_id_and_created_at'
      SQL

      expect(result["indexdef"]).to include("organization_id", "created_at")
    end

    it "is used for org + date-range queries" do
      org = create(:organization)
      create_list(:audit_log, 5, organization: org, created_at: 7.days.ago)

      query = AuditLog
        .where(organization_id: org.id)
        .where("created_at >= ?", 30.days.ago)
        .order(created_at: :desc)

      plan_json = conn.execute("EXPLAIN (FORMAT JSON) #{query.to_sql}").first["QUERY PLAN"]
      node_types = extract_node_types(JSON.parse(plan_json))

      expect(node_types).to(
        satisfy("include Index Scan or Index Only Scan") do |types|
          types.include?("Index Scan") || types.include?("Index Only Scan")
        end
      )
      expect(plan_json).to include("index_audit_logs_on_organization_id_and_created_at")
    end
  end

  private

  def extract_node_types(plan, acc = [])
    plan.each do |node|
      node_info = node.is_a?(Hash) ? node["Plan"] || node : node
      next unless node_info.is_a?(Hash)

      acc << node_info["Node Type"] if node_info["Node Type"]
      extract_node_types(Array(node_info["Plans"]), acc)
    end
    acc
  end
end
