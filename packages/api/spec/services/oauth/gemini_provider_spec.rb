# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Oauth::GeminiProvider, type: :service do
  let(:connector) { instance_double('OrganizationConnector', access_token: 'AIza-test123', organization_id: 42) }
  let(:provider) { described_class.new(connector) }

  describe '#fetch_usage' do
    it 'returns nil' do
      expect(provider.fetch_usage).to be_nil
    end

    it 'logs a warning explaining that no historical usage API exists' do
      expect(Rails.logger).to receive(:warn).with(/no historical usage API/)
      provider.fetch_usage
    end
  end

  describe '#test_connection' do
    context 'when the API key is valid' do
      it 'returns success' do
        stub_request(:get, 'https://generativelanguage.googleapis.com/v1beta/models')
          .with(query: { 'key' => 'AIza-test123' })
          .to_return(status: 200, body: '{"models":[]}', headers: { 'Content-Type' => 'application/json' })

        result = provider.test_connection

        expect(result[:success]).to be true
      end
    end

    context 'when the API key is invalid (401)' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://generativelanguage.googleapis.com/v1beta/models')
          .with(query: hash_including('key' => 'AIza-test123'))
          .to_return(status: 401, body: '{"error":"unauthorized"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq('Invalid API key')
      end
    end

    context 'when the API key is forbidden (403)' do
      it 'returns failure with error message' do
        stub_request(:get, 'https://generativelanguage.googleapis.com/v1beta/models')
          .with(query: hash_including('key' => 'AIza-test123'))
          .to_return(status: 403, body: '{"error":"forbidden"}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to eq('Invalid API key')
      end
    end

    context 'when the API returns another error status' do
      it 'returns failure with status code in message' do
        stub_request(:get, 'https://generativelanguage.googleapis.com/v1beta/models')
          .with(query: hash_including('key' => 'AIza-test123'))
          .to_return(status: 500, body: '{}')

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('500')
      end
    end

    context 'when a network error occurs' do
      it 'returns failure with connection error message' do
        stub_request(:get, 'https://generativelanguage.googleapis.com/v1beta/models')
          .with(query: hash_including('key' => 'AIza-test123'))
          .to_raise(Faraday::ConnectionFailed.new('connection refused'))

        result = provider.test_connection

        expect(result[:success]).to be false
        expect(result[:error]).to include('Connection error')
      end
    end
  end
end
