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
    allow(RawEventStore).to receive(:ensure_bucket_exists!).and_return(nil)
    allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
    allow(Temporal::Client).to receive(:start_workflow).and_return({ workflow_id: 'test-workflow-id' })
    allow(Temporal::Client).to receive(:workers_polling?).and_return(true)

    # Use a real in-memory cache so Rails.cache.increment works in specs.
    # The default test environment uses :null_store which returns nil from #increment.
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  after do
    Rails.cache = @original_cache
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

    context 'with a pending ingest setup token' do
      before do
        tool_account.update!(connection_state: 'waiting_for_connection')
      end

      it 'accepts the first event and activates the account' do
        ingest_post

        expect(response).to have_http_status(:accepted)
        expect(tool_account.reload.connection_state).to eq('active')
      end

      it 'returns accepted even when a concurrent request already activated the account' do
        # Simulate race: account is already active by the time activate_connection! fires.
        tool_account.update_column(:connection_state, 'active')

        ingest_post

        expect(response).to have_http_status(:accepted)
        expect(tool_account.reload.connection_state).to eq('active')
      end
    end

    context 'with a raw Claude Code PostToolUse hook payload' do
      let(:claude_code_post_tool_use_payload) do
        {
          session_id: 'session-abc123',
          tool_name: 'Edit',
          tool_input: { file_path: '/foo/bar.rb', old_string: 'x', new_string: 'y' },
          tool_response: { success: true }
        }
      end

      it 'maps event_type to "tool_use"' do
        ingest_post(payload: claude_code_post_tool_use_payload)
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:event_type]).to eq('tool_use')
        end
      end

      it 'stores session_id and hook_tool in metadata' do
        ingest_post(payload: claude_code_post_tool_use_payload)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          metadata = kwargs[:args][:event][:metadata]
          expect(metadata['session_id']).to eq('session-abc123')
          expect(metadata['hook_tool']).to eq('Edit')
        end
      end

      it 'always uses the account tool_name regardless of hook tool_name' do
        ingest_post(payload: claude_code_post_tool_use_payload)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:tool_name]).to eq('cursor')
        end
      end
    end

    context 'with a raw Claude Code Stop hook payload' do
      let(:claude_code_stop_payload) do
        {
          session_id: 'session-xyz789',
          stop_hook_active: false,
          usage: { input_tokens: 1500, output_tokens: 300 },
          total_cost_usd: 0.025
        }
      end

      it 'maps event_type to "chat"' do
        ingest_post(payload: claude_code_stop_payload)
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:event_type]).to eq('chat')
        end
      end

      it 'extracts tokens_in, tokens_out, and cost_usd from usage' do
        ingest_post(payload: claude_code_stop_payload)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          event = kwargs[:args][:event]
          expect(event[:tokens_in]).to eq(1500)
          expect(event[:tokens_out]).to eq(300)
          expect(event[:cost_usd]).to eq(0.025)
        end
      end

      it 'stores session_id in metadata' do
        ingest_post(payload: claude_code_stop_payload)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:metadata]['session_id']).to eq('session-xyz789')
        end
      end

      context 'when usage data is absent' do
        let(:minimal_stop_payload) { { session_id: 'session-min', stop_hook_active: false } }

        it 'still maps event_type to "chat" with no token data' do
          ingest_post(payload: minimal_stop_payload)
          expect(response).to have_http_status(:accepted)
          expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
            event = kwargs[:args][:event]
            expect(event[:event_type]).to eq('chat')
            expect(event[:tokens_in]).to be_nil
            expect(event[:tokens_out]).to be_nil
          end
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

      it 'returns 401 when account is inactive after it has already been used' do
        create(
          :tool_event,
          organization: organization,
          user: user,
          tool_name: tool_account.tool_name,
          event_type: 'completion'
        )
        tool_account.update!(connection_state: 'inactive')
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

    context 'when raw event storage fails before Temporal starts' do
      before do
        allow(RawEventStore).to receive(:store).and_raise(StandardError, 'S3 unavailable')
      end

      it 'falls back directly without starting the workflow' do
        expect {
          ingest_post
        }.to change(ToolEvent, :count).by(1)

        expect(response).to have_http_status(:accepted)
        expect(json_data[:fallback]).to be true
        expect(json_data[:workflowId]).to be_nil
        expect(json_data[:rawEventKey]).to be_nil
        expect(Temporal::Client).not_to have_received(:start_workflow)
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

    # CUR-V08 — cursor recentCommit payload (Path B) must ingest as event_type commit
    context 'with a cursor recent_commit payload (CUR-V08)' do
      let(:cursor_commit_payload) do
        {
          event_type: 'commit',
          model: 'unknown',
          tokens_in: 507,
          tokens_out: 36,
          cost_usd: 0.171,
          occurred_at: '2026-05-27T17:45:14.899Z',
          metadata: {
            cursor_session_id: nil,
            workspace: '/tmp/globalStorage/state.vscdb',
            workspace_scope: 'global',
            cost_model: 'estimated_line_count',
            source: 'recent_commit',
            commit_hash: '1080c8e38aa694380e5e5d14c950123e6e1a2942',
            commit_message: '[AIX-235] Example commit ingest verification',
            repo_name: 'acme/demo',
            branch_name: 'feature/example',
            ai_percentage: 100,
            scannable: false,
            risk_level: 'none'
          }
        }
      end

      it 'returns 202 Accepted and passes event_type commit to Temporal' do
        ingest_post(payload: cursor_commit_payload)
        expect(response).to have_http_status(:accepted)
        expect(json_data[:accepted]).to be true
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:event_type]).to eq('commit')
          expect(kwargs[:args][:event][:metadata]['source']).to eq('recent_commit')
        end
      end

      context 'when Temporal workflow fails (fallback direct insert)' do
        before do
          allow(Temporal::Client).to receive(:start_workflow).and_raise(StandardError, 'skip workflow')
        end

        it 'persists ToolEvent with event_type commit and recent_commit metadata' do
          expect {
            ingest_post(payload: cursor_commit_payload)
          }.to change(ToolEvent, :count).by(1)

          event = ToolEvent.last
          expect(event.tool_name).to eq('cursor')
          expect(event.event_type).to eq('commit')
          expect(event.metadata['source']).to eq('recent_commit')
          expect(event.metadata['commit_hash']).to eq('1080c8e38aa694380e5e5d14c950123e6e1a2942')
          expect(event.metadata['repo_name']).to eq('acme/demo')
        end
      end
    end

    context 'with rate limiting' do
      it 'returns 202 when under the per-minute limit' do
        OrganizationSetting.set(organization, 'ingest_rate_limit_per_minute', '3')
        2.times { ingest_post }
        ingest_post
        expect(response).to have_http_status(:accepted)
      end

      it 'returns 429 when per-minute limit is exceeded' do
        OrganizationSetting.set(organization, 'ingest_rate_limit_per_minute', '2')
        2.times { ingest_post }
        ingest_post
        expect(response).to have_http_status(:too_many_requests)
        expect(response.parsed_body.dig('code')).to eq('rate_limit_exceeded')
        expect(response.headers['Retry-After']).to eq('60')
      end

      it 'includes retry_after in the 429 body' do
        OrganizationSetting.set(organization, 'ingest_rate_limit_per_minute', '1')
        ingest_post
        ingest_post
        expect(response.parsed_body.dig('retry_after')).to eq(60)
      end

      it 'falls back to ENV default when no org setting exists' do
        allow(ENV).to receive(:fetch).and_call_original
        allow(ENV).to receive(:fetch).with("INGEST_RATE_LIMIT_DEFAULT", "1000").and_return("2")
        2.times { ingest_post }
        ingest_post
        expect(response).to have_http_status(:too_many_requests)
      end

      it 'fails open when Redis returns nil (cache unavailable)' do
        allow(Rails.cache).to receive(:increment).and_return(nil)
        ingest_post
        expect(response).to have_http_status(:accepted)
      end
    end

    context 'with monthly quota' do
      it 'returns 202 when under the monthly quota' do
        OrganizationSetting.set(organization, 'ingest_monthly_event_quota', '3')
        2.times { ingest_post }
        ingest_post
        expect(response).to have_http_status(:accepted)
      end

      it 'returns 429 with quota_exceeded when monthly quota is reached' do
        OrganizationSetting.set(organization, 'ingest_monthly_event_quota', '2')
        2.times { ingest_post }
        ingest_post
        expect(response).to have_http_status(:too_many_requests)
        expect(response.parsed_body.dig('code')).to eq('quota_exceeded')
      end

      it 'includes quota_resets_at in the quota_exceeded body' do
        OrganizationSetting.set(organization, 'ingest_monthly_event_quota', '1')
        ingest_post
        ingest_post
        body = response.parsed_body
        expect(body['quota_resets_at']).to be_present
        resets_at = Time.parse(body['quota_resets_at'])
        expect(resets_at).to be >= Time.current.end_of_month
      end

      it 'caps Retry-After at 3600 seconds' do
        OrganizationSetting.set(organization, 'ingest_monthly_event_quota', '1')
        ingest_post
        ingest_post
        expect(response.headers['Retry-After'].to_i).to be <= 3600
      end

      it 'returns 202 when no quota setting exists (unlimited)' do
        100.times { ingest_post }
        expect(response).to have_http_status(:accepted)
      end

      it 'fails open when Redis returns nil for quota check' do
        OrganizationSetting.set(organization, 'ingest_monthly_event_quota', '1')
        allow(Rails.cache).to receive(:increment).and_return(nil)
        ingest_post
        expect(response).to have_http_status(:accepted)
      end
    end

    context 'with project_id guard' do
      let!(:accessible_project) do
        create(:project, organization: organization, owner: nil)
      end
      let(:other_organization) { create(:organization) }
      let!(:other_project) do
        create(:project, organization: other_organization, owner: nil)
      end

      it 'passes project_id through when it belongs to the token org' do
        ingest_post(payload: valid_payload.merge(project_id: accessible_project.id))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:project_id]).to eq(accessible_project.id)
        end
      end

      it 'strips project_id from workflow payload when it belongs to a different org' do
        ingest_post(payload: valid_payload.merge(project_id: other_project.id))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:project_id]).to be_nil
        end
      end

      it 'strips malformed (non-UUID) project_id from workflow payload' do
        ingest_post(payload: valid_payload.merge(project_id: 'not-a-uuid'))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:project_id]).to be_nil
        end
      end

      it 'passes project_id through when it belongs to the token user as a personal project' do
        personal_project = create(:project, :personal, owner: user, organization: nil)
        ingest_post(payload: valid_payload.merge(project_id: personal_project.id))
        expect(response).to have_http_status(:accepted)
        expect(Temporal::Client).to have_received(:start_workflow) do |_workflow, **kwargs|
          expect(kwargs[:args][:event][:project_id]).to eq(personal_project.id)
        end
      end
    end
  end
end
