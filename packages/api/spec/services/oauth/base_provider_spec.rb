# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::BaseProvider, type: :service do
  describe '.for' do
    it 'returns the correct provider instance for github' do
      connector = instance_double('OrganizationConnector', connector_type: 'github')
      expect(described_class.for(connector)).to be_a(Oauth::GithubProvider)
    end

    it 'returns the correct provider instance for gitlab' do
      connector = instance_double('OrganizationConnector', connector_type: 'gitlab')
      expect(described_class.for(connector)).to be_a(Oauth::GitlabProvider)
    end

    it 'returns the correct provider instance for anthropic' do
      connector = instance_double('OrganizationConnector', connector_type: 'anthropic')
      expect(described_class.for(connector)).to be_a(Oauth::AnthropicProvider)
    end
  end

  describe '.provider_class' do
    it 'returns GithubProvider for "github"' do
      expect(described_class.provider_class('github')).to eq(Oauth::GithubProvider)
    end

    it 'returns GitlabProvider for "gitlab"' do
      expect(described_class.provider_class('gitlab')).to eq(Oauth::GitlabProvider)
    end

    it 'returns BitbucketProvider for "bitbucket"' do
      expect(described_class.provider_class('bitbucket')).to eq(Oauth::BitbucketProvider)
    end

    it 'returns JiraProvider for "jira"' do
      expect(described_class.provider_class('jira')).to eq(Oauth::JiraProvider)
    end

    it 'returns LinearProvider for "linear"' do
      expect(described_class.provider_class('linear')).to eq(Oauth::LinearProvider)
    end

    it 'returns AnthropicProvider for "anthropic"' do
      expect(described_class.provider_class('anthropic')).to eq(Oauth::AnthropicProvider)
    end

    it 'returns OpenaiProvider for "openai"' do
      expect(described_class.provider_class('openai')).to eq(Oauth::OpenaiProvider)
    end

    it 'returns OpenrouterProvider for "openrouter"' do
      expect(described_class.provider_class('openrouter')).to eq(Oauth::OpenrouterProvider)
    end

    it 'returns GeminiProvider for "gemini"' do
      expect(described_class.provider_class('gemini')).to eq(Oauth::GeminiProvider)
    end

    it 'raises NotImplementedError for unknown connector type' do
      expect { described_class.provider_class('unknown') }
        .to raise_error(NotImplementedError, /Unknown connector type: unknown/)
    end
  end

  describe '.authorization_url' do
    context 'when client_id is missing' do
      before { allow(Oauth::GithubProvider).to receive(:client_id).and_return(nil) }

      it 'raises MissingCredentialsError with the provider name' do
        expect {
          Oauth::GithubProvider.authorization_url(organization_id: 'org-1', redirect_uri: 'https://example.com/cb')
        }.to raise_error(Oauth::MissingCredentialsError, /Github.*missing client_id/)
      end
    end
  end

  describe '.exchange_code' do
    context 'when client_secret is missing' do
      before do
        allow(Oauth::GithubProvider).to receive(:client_id).and_return('client-id')
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return(nil)
      end

      it 'raises MissingCredentialsError mentioning client_secret' do
        expect {
          Oauth::GithubProvider.exchange_code('code', redirect_uri: 'https://example.com/cb')
        }.to raise_error(Oauth::MissingCredentialsError, /missing client_secret/)
      end
    end

    context 'when client_id is missing' do
      before do
        allow(Oauth::GithubProvider).to receive(:client_id).and_return(nil)
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return('client-secret')
      end

      it 'raises MissingCredentialsError mentioning client_id' do
        expect {
          Oauth::GithubProvider.exchange_code('code', redirect_uri: 'https://example.com/cb')
        }.to raise_error(Oauth::MissingCredentialsError, /missing client_id/)
      end
    end

    context 'when both client_id and client_secret are missing' do
      before do
        allow(Oauth::GithubProvider).to receive(:client_id).and_return(nil)
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return(nil)
      end

      it 'raises MissingCredentialsError mentioning both' do
        expect {
          Oauth::GithubProvider.exchange_code('code', redirect_uri: 'https://example.com/cb')
        }.to raise_error(Oauth::MissingCredentialsError, /missing client_id and client_secret/)
      end
    end
  end

  describe '#test_connection' do
    it 'raises NotImplementedError on the base class' do
      connector = instance_double('OrganizationConnector')
      provider = described_class.new(connector)
      expect { provider.test_connection }.to raise_error(NotImplementedError, /Subclass must implement test_connection/)
    end
  end

  describe '#refresh_token!' do
    let(:connector) { create(:organization_connector, :with_tokens, connector_type: 'github') }
    let(:provider) { Oauth::GithubProvider.new(connector) }

    context 'when connector has no refresh token' do
      before { connector.update!(refresh_token: nil) }

      it 'returns false without making any request' do
        expect(provider.refresh_token!).to be false
      end
    end

    context 'when the token refresh succeeds' do
      before do
        allow(Oauth::GithubProvider).to receive(:client_id).and_return('client-id')
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return('client-secret')

        stub_request(:post, 'https://github.com/login/oauth/access_token')
          .to_return(
            status: 200,
            body: { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
      end

      it 'returns true' do
        expect(provider.refresh_token!).to be true
      end

      it 'updates the connector access_token' do
        provider.refresh_token!
        expect(connector.reload.access_token).to eq('new-token')
      end

      it 'updates the connector refresh_token' do
        provider.refresh_token!
        expect(connector.reload.refresh_token).to eq('new-refresh')
      end

      it 'updates token_expires_at' do
        provider.refresh_token!
        expect(connector.reload.token_expires_at).to be_present
      end
    end

    context 'when the token refresh returns an error' do
      before do
        allow(Oauth::GithubProvider).to receive(:client_id).and_return('client-id')
        allow(Oauth::GithubProvider).to receive(:client_secret).and_return('client-secret')

        stub_request(:post, 'https://github.com/login/oauth/access_token')
          .to_return(
            status: 200,
            body: { error: 'bad_verification_code' }.to_json,
            headers: { 'Content-Type' => 'application/json' }
          )
      end

      it 'returns false' do
        expect(provider.refresh_token!).to be false
      end

      it 'does not update the connector' do
        original_token = connector.access_token
        provider.refresh_token!
        expect(connector.reload.access_token).to eq(original_token)
      end
    end
  end
end
