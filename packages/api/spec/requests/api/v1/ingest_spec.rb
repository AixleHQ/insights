# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Ingest', type: :request do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization) }
  let!(:tool_account) { create(:user_tool_account, organization_membership: membership, tool_name: 'cursor') }
  let(:raw_token) { tool_account.plaintext_token }

  let(:valid_payload) do
    {
      event_type: 'completion',
      model: 'claude-3-5-sonnet',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.002,
      duration_ms: 1200
    }
  end

  before do
    allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
    allow(Temporal::Client).to receive(:start_workflow).and_return({ workflow_id: 'test-workflow-id' })
  end

  def ingest_post(payload: valid_payload, token: raw_token)
    headers = { 'Content-Type' => 'application/json' }
    headers['Authorization'] = "Bearer #{token}" if token
    post '/api/v1/ingest/events', params: payload.to_json, headers: headers
  end

  describe 'POST /api/v1/ingest/events' do
    context 'with a valid active token' do
      it 'returns 202 Accepted' do
        ingest_post
        expect(response).to have_http_status(:accepted)
      end

      it 'returns accepted: true in the response body' do
        ingest_post
        expect(json_data[:accepted]).to be true
      end

      it 'returns a workflowId' do
        ingest_post
        expect(json_data[:workflowId]).to be_present
      end

      it 'always uses the account tool_name regardless of payload' do
        ingest_post(payload: valid_payload.merge(tool_name: 'Edit'))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:tool_name]).to eq('cursor')
        end
      end

      it 'defaults event_type to "other" when not provided' do
        ingest_post(payload: valid_payload.except(:event_type))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:event_type]).to eq('other')
        end
      end
    end

    context 'with authentication failures' do
      it 'returns 401 when Authorization header is missing' do
        post '/api/v1/ingest/events',
             params: valid_payload.to_json,
             headers: { 'Content-Type' => 'application/json' }
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when header has no Bearer prefix' do
        post '/api/v1/ingest/events',
             params: valid_payload.to_json,
             headers: { 'Content-Type' => 'application/json', 'Authorization' => raw_token }
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when token does not start with db90_ prefix' do
        ingest_post(token: 'not_a_db90_token_abc123')
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when token hash does not match any account' do
        ingest_post(token: "db90_#{SecureRandom.hex(32)}")
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when account is inactive' do
        tool_account.update!(is_active: false)
        ingest_post
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when a JWT token is used instead of an ingest token' do
        ingest_post(token: "test-token-for-#{user.id}")
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns 401 when organization is deleted' do
        organization.destroy!
        tool_account_without_org = UserToolAccount.find_by(id: tool_account.id)
        # After org deletion the association is gone; token lookup still finds record
        # but authenticate_by_token! checks organization.present?
        ingest_post
        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when Temporal workflow fails' do
      before do
        allow(Temporal::Client).to receive(:start_workflow).and_raise(StandardError, 'Connection failed')
        # fallback_direct_insert needs tool_events association — stub it
        allow_any_instance_of(Organization).to receive_message_chain(:tool_events, :create!).and_return(
          instance_double(ToolEvent, id: SecureRandom.uuid)
        )
      end

      it 'still returns 202 via fallback direct insert' do
        ingest_post
        expect(response).to have_http_status(:accepted)
      end
    end

    context 'with full integration flow' do
      before do
        allow(Temporal::Client).to receive(:start_workflow).and_raise(StandardError, 'skip workflow')
      end

      it 'creates a ToolEvent with correct organization_id, user_id, and tool_name' do
        expect {
          ingest_post(payload: valid_payload)
        }.to change(ToolEvent, :count).by(1)

        event = ToolEvent.last
        expect(event.organization_id).to eq(organization.id)
        expect(event.user_id).to eq(user.id)
        expect(event.tool_name).to eq('cursor')
      end
    end
  end
end
