# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Telemetry', type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'member') }

  describe 'POST /api/v1/organizations/:organization_id/telemetry/ingest' do
    let(:valid_params) do
      {
        tool_name: 'claude_code',
        event_type: 'chat',
        model: 'claude-3-sonnet',
        tokens_in: 100,
        tokens_out: 500,
        cost_usd: 0.05,
        duration_ms: 1500,
        occurred_at: Time.current.iso8601
      }
    end

    before do
      # Mock RawEventStore and Temporal::Client for testing
      allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
      allow(Temporal::Client).to receive(:start_workflow).and_return({ workflow_id: 'test-workflow-id' })
    end

    it 'accepts and queues a telemetry event' do
      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/ingest",
                         user: user,
                         organization: organization,
                         params: valid_params

      expect(response).to have_http_status(:accepted)
      expect(json_data[:accepted]).to eq(true)
      expect(json_data[:workflowId]).to be_present
    end

    it 'falls back to direct insert when Temporal fails' do
      allow(Temporal::Client).to receive(:start_workflow).and_raise(StandardError, 'Connection failed')

      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/ingest",
                         user: user,
                         organization: organization,
                         params: valid_params

      expect(response).to have_http_status(:accepted)
      expect(json_data[:accepted]).to eq(true)
      expect(ToolEvent.last.tool_name).to eq('claude_code')
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/ingest",
                         user: non_member,
                         organization: organization,
                         params: valid_params

      expect_forbidden
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/telemetry/batch' do
    let(:batch_params) do
      {
        events: [
          { tool_name: 'claude_code', event_type: 'chat', tokens_in: 100, tokens_out: 200 },
          { tool_name: 'cursor', event_type: 'completion', tokens_in: 50, tokens_out: 150 }
        ]
      }
    end

    before do
      allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
      allow(Temporal::Client).to receive(:start_workflow).and_return({ workflow_id: 'test-workflow-id' })
    end

    it 'accepts a batch of events' do
      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/batch",
                         user: user,
                         organization: organization,
                         params: batch_params

      expect(response).to have_http_status(:accepted)
      expect(json_data[:total]).to eq(2)
      expect(json_data[:accepted]).to eq(2)
    end

    it 'returns bad request when no events provided' do
      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/batch",
                         user: user,
                         organization: organization,
                         params: { events: [] }

      expect_bad_request
    end
  end
end
