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
      allow(RawEventStore).to receive(:ensure_bucket_exists!).and_return(nil)
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
      allow(RawEventStore).to receive(:ensure_bucket_exists!).and_return(nil)
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

  # AIX-370 (OWASP A09-1). Both assertions matter together: the client must not
  # receive the exception text, and the server log must still retain it. Asserting
  # only the first would pass just as well if the detail were silently discarded.
  describe 'exception text is never echoed to the client' do
    let(:sensitive_message) do
      'PG::UniqueViolation: duplicate key value violates constraint on internal_audit_log_9f8a'
    end

    before do
      allow(RawEventStore).to receive(:ensure_bucket_exists!).and_return(nil)
      allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
      # Force the Temporal path to fall back, then make the direct insert blow up —
      # fallback_direct_insert is the one call in #ingest with no rescue of its own.
      allow(Temporal::Client).to receive(:start_workflow).and_raise(StandardError, 'temporal unavailable')
      allow_any_instance_of(Organization).to receive(:tool_events).and_raise(StandardError, sensitive_message)
    end

    it 'keeps ingest failure detail in the log and out of the response' do
      logged = []
      allow(Rails.logger).to receive(:error) { |message| logged << message }

      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/ingest",
                         user: user,
                         organization: organization,
                         params: { tool_name: 'claude_code', event_type: 'chat', tokens_in: 1, tokens_out: 1 }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json_response).to eq({ error: 'Processing failed' })
      expect(response.body).not_to include(sensitive_message)

      expect(logged.find { |m| m.include?('[Telemetry] Ingest failed') }).to include(sensitive_message)
    end

    it 'keeps per-event batch failure detail in the log and out of the response' do
      logged = []
      allow(Rails.logger).to receive(:error) { |message| logged << message }

      authenticated_post "/api/v1/organizations/#{organization.id}/telemetry/batch",
                         user: user,
                         organization: organization,
                         params: { events: [ { tool_name: 'claude_code', event_type: 'chat' } ] }

      expect(response).to have_http_status(:accepted)
      expect(json_data[:failed]).to eq(1)
      expect(json_data[:results].first[:error]).to eq('Processing failed')
      expect(response.body).not_to include(sensitive_message)

      expect(logged.find { |m| m.include?('[Telemetry] Batch event') }).to include(sensitive_message)
    end
  end
end
