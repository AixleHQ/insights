# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Webhooks', type: :request do
  let(:organization) { create(:organization) }
  let(:user)         { create(:user) }
  let(:secret)       { 'shhh-its-a-secret' }
  let(:connector) do
    create(:organization_connector, :github, organization: organization, webhook_secret: secret)
  end
  let(:body) { { action: 'opened', number: 1 }.to_json }

  before do
    allow(RawEventStore).to receive(:store).and_return('events/test-key.json')
    allow(WebhookRouter).to receive(:dispatch).and_return(true)
  end

  def post_webhook(provider:, connector_id:, signature_headers: {})
    headers = {
      'Content-Type'  => 'application/json',
      'Authorization' => "Bearer test-token-for-#{user.id}"
    }.merge(signature_headers)
    post "/api/v1/webhooks/#{provider}/#{connector_id}", params: body, headers: headers
  end

  def github_signature_headers(payload, connector_secret)
    { 'X-Hub-Signature-256' => Webhooks::GithubVerifier.compute_signature(payload, connector_secret), 'X-GitHub-Event' => 'issues' }
  end

  describe 'POST /api/v1/webhooks/:provider/:connector_id' do
    context 'with a valid signature and configured secret' do
      it 'accepts the webhook and dispatches it' do
        post_webhook(provider: 'github', connector_id: connector.id, signature_headers: github_signature_headers(body, secret))

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json['data']['received']).to eq(true)
        expect(WebhookDelivery.last.provider).to eq('github')
        expect(WebhookRouter).to have_received(:dispatch)
      end
    end

    context 'with an invalid signature' do
      it 'returns 401 Invalid signature (not a 500)' do
        post_webhook(provider: 'github', connector_id: connector.id, signature_headers: { 'X-Hub-Signature-256' => 'sha256=deadbeef' })

        expect(response).to have_http_status(:unauthorized)
        expect(JSON.parse(response.body)['error']).to eq('Invalid signature')
        expect(WebhookRouter).not_to have_received(:dispatch)
      end
    end

    context 'with no signature header at all' do
      it 'returns 400 Missing signature (not a 500)' do
        post_webhook(provider: 'github', connector_id: connector.id)

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)['error']).to eq('Missing signature')
        expect(WebhookRouter).not_to have_received(:dispatch)
      end
    end

    context 'when the connector has no webhook_secret configured (the fail-open case)' do
      let(:connector) { create(:organization_connector, :github, organization: organization, webhook_secret: nil) }

      it 'rejects the webhook instead of processing it unsigned' do
        post_webhook(provider: 'github', connector_id: connector.id, signature_headers: { 'X-Hub-Signature-256' => 'sha256=anything' })

        expect(response).not_to have_http_status(:ok)
        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)['message']).to eq('Missing webhook secret')
        expect(WebhookRouter).not_to have_received(:dispatch)
      end
    end

    context 'when the connector does not exist' do
      it 'returns 404' do
        post_webhook(provider: 'github', connector_id: SecureRandom.uuid)

        expect(response).to have_http_status(:not_found)
      end
    end

    context 'with an unknown provider' do
      it 'returns 400 Unknown provider (not a 500)' do
        post_webhook(provider: 'not_a_real_provider', connector_id: connector.id)

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)['error']).to eq('Unknown provider')
      end
    end

    context 'when the URL provider does not match the connector type' do
      let(:connector) { create(:organization_connector, :gitlab, organization: organization, webhook_secret: secret) }

      it 'passes signature verification but rejects on provider mismatch' do
        post_webhook(provider: 'github', connector_id: connector.id, signature_headers: github_signature_headers(body, secret))

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)['error']).to eq('Provider mismatch')
      end
    end

    context 'with no Authorization header at all (matches real provider traffic)' do
      it 'still reaches the controller and is accepted on a valid signature' do
        headers = { 'Content-Type' => 'application/json' }.merge(github_signature_headers(body, secret))
        post "/api/v1/webhooks/github/#{connector.id}", params: body, headers: headers

        expect(response).to have_http_status(:ok)
      end
    end
  end
end
