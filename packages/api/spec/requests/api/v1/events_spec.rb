# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Events', type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'member') }

  let!(:tool_event) do
    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'claude_code',
           event_type: 'chat',
           tokens_in: 100,
           tokens_out: 500)
  end

  describe 'GET /api/v1/organizations/:organization_id/events' do
    it 'returns events for the organization' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).to be_an(Array)
      expect(json_data.first[:id]).to eq(tool_event.id)
    end

    it 'filters by tool_name' do
      create(:tool_event, organization: organization, user: user, tool_name: 'cursor')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization,
                        params: { tool_name: 'claude_code' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:toolName]).to eq('claude_code')
    end

    it 'filters by event_type' do
      create(:tool_event, organization: organization, user: user, event_type: 'completion')

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: user,
                        organization: organization,
                        params: { event_type: 'chat' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:eventType]).to eq('chat')
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/events",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/:id' do
    it 'returns the event details' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(tool_event.id)
      expect(json_data[:inputTokens]).to eq(100)
      expect(json_data[:outputTokens]).to eq(500)
    end

    it "returns attribution 'user' for user-generated events" do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:attribution]).to eq("user")
    end

    it "returns attribution 'organization' for reconciled events" do
      org_event = create(:tool_event,
                         organization: organization,
                         user: nil,
                         metadata: { "reconciled" => true })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{org_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:attribution]).to eq("organization")
    end

    it "falls back to workspace_name for project when no project is assigned" do
      ws_event = create(:tool_event,
                        organization: organization,
                        user: user,
                        project: nil,
                        metadata: { "workspace_name" => "engineering-team" })

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{ws_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:project][:name]).to eq("engineering-team")
      expect(json_data[:project][:id]).to be_nil
    end

    it "returns project with id and slug when project is assigned" do
      project = create(:project, organization: organization)
      project_event = create(:tool_event,
                             organization: organization,
                             user: user,
                             project: project)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{project_event.id}",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:project][:id]).to eq(project.id)
      expect(json_data[:project][:name]).to eq(project.name)
      expect(json_data[:project][:slug]).to eq(project.slug)
    end

    it 'returns 404 for non-existent event' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/nonexistent",
                        user: user,
                        organization: organization

      expect_not_found
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/summary' do
    it 'returns summary statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/summary",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:totalEvents]).to eq(1)
      expect(json_data[:totalTokensIn]).to eq(100)
      expect(json_data[:totalTokensOut]).to eq(500)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/unattributed' do
    it 'returns events without user attribution' do
      unattributed_event = create(:tool_event, organization: organization, user: nil)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/unattributed",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data.map { |e| e[:id] }).to include(unattributed_event.id)
      expect(json_data.map { |e| e[:id] }).not_to include(tool_event.id)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/events/:id/audit_trail' do
    it 'returns the audit trail for an event' do
      audit_log = create(:audit_log, tool_event: tool_event, organization: organization)

      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}/audit_trail",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(audit_log.id)
    end

    it 'returns null data when no audit trail exists' do
      authenticated_get "/api/v1/organizations/#{organization.id}/events/#{tool_event.id}/audit_trail",
                        user: user,
                        organization: organization

      expect_success
      expect(json_data).to be_nil
    end
  end
end
