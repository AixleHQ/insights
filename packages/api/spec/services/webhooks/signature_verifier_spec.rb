# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Webhooks::SignatureVerifier do
  describe '.for' do
    it 'returns GithubVerifier for github provider' do
      expect(described_class.for('github')).to eq(Webhooks::GithubVerifier)
    end

    it 'returns GitlabVerifier for gitlab provider' do
      expect(described_class.for('gitlab')).to eq(Webhooks::GitlabVerifier)
    end

    it 'returns BitbucketVerifier for bitbucket provider' do
      expect(described_class.for('bitbucket')).to eq(Webhooks::BitbucketVerifier)
    end

    it 'returns JiraVerifier for jira provider' do
      expect(described_class.for('jira')).to eq(Webhooks::JiraVerifier)
    end

    it 'returns LinearVerifier for linear provider' do
      expect(described_class.for('linear')).to eq(Webhooks::LinearVerifier)
    end

    it 'raises ArgumentError for unknown provider' do
      expect { described_class.for('unknown') }.to raise_error(ArgumentError, /Unknown webhook provider/)
    end
  end

  describe '.verify' do
    let(:payload) { '{"test": "data"}' }
    let(:secret) { 'test-secret-123' }

    it 'returns true for valid signature' do
      signature = Webhooks::GithubVerifier.compute_signature(payload, secret)

      result = described_class.verify(
        provider: 'github',
        payload: payload,
        signature: signature,
        secret: secret
      )

      expect(result).to eq(true)
    end

    it 'returns false for invalid signature' do
      result = described_class.verify(
        provider: 'github',
        payload: payload,
        signature: 'invalid-signature',
        secret: secret
      )

      expect(result).to eq(false)
    end
  end

  describe '.supported_providers' do
    it 'returns all supported providers' do
      expect(described_class.supported_providers).to include('github', 'gitlab', 'bitbucket', 'jira', 'linear')
    end
  end
end

RSpec.describe Webhooks::GithubVerifier do
  let(:payload) { '{"action": "push"}' }
  let(:secret) { 'github-webhook-secret' }

  describe '.verify!' do
    it 'succeeds with valid signature' do
      signature = described_class.compute_signature(payload, secret)

      expect {
        described_class.verify!(payload: payload, signature: signature, secret: secret)
      }.not_to raise_error
    end

    it 'raises SignatureInvalidError with invalid signature' do
      expect {
        described_class.verify!(payload: payload, signature: 'sha256=invalid', secret: secret)
      }.to raise_error(Webhooks::SignatureInvalidError)
    end

    it 'raises SignatureMissingError when signature is blank' do
      expect {
        described_class.verify!(payload: payload, signature: '', secret: secret)
      }.to raise_error(Webhooks::SignatureMissingError)
    end

    it 'raises SignatureMissingError when secret is blank' do
      expect {
        described_class.verify!(payload: payload, signature: 'sha256=abc', secret: '')
      }.to raise_error(Webhooks::SignatureMissingError)
    end
  end

  describe '.compute_signature' do
    it 'returns sha256 prefixed signature' do
      signature = described_class.compute_signature(payload, secret)

      expect(signature).to start_with('sha256=')
    end

    it 'produces consistent signatures' do
      sig1 = described_class.compute_signature(payload, secret)
      sig2 = described_class.compute_signature(payload, secret)

      expect(sig1).to eq(sig2)
    end
  end
end

RSpec.describe Webhooks::GitlabVerifier do
  let(:payload) { '{"object_kind": "push"}' }
  let(:secret) { 'gitlab-secret-token' }

  describe '.verify!' do
    it 'succeeds when token matches secret' do
      expect {
        described_class.verify!(payload: payload, signature: secret, secret: secret)
      }.not_to raise_error
    end

    it 'raises SignatureInvalidError when token does not match' do
      expect {
        described_class.verify!(payload: payload, signature: 'wrong-token', secret: secret)
      }.to raise_error(Webhooks::SignatureInvalidError)
    end
  end
end

RSpec.describe Webhooks::LinearVerifier do
  let(:payload) { '{"type": "Issue", "action": "create"}' }
  let(:secret) { 'linear-webhook-secret' }

  describe '.verify!' do
    it 'succeeds with valid HMAC signature' do
      signature = described_class.compute_signature(payload, secret)

      expect {
        described_class.verify!(payload: payload, signature: signature, secret: secret)
      }.not_to raise_error
    end
  end

  describe '.compute_signature' do
    it 'returns hex digest without prefix' do
      signature = described_class.compute_signature(payload, secret)

      expect(signature).not_to start_with('sha256=')
      expect(signature).to match(/\A[a-f0-9]+\z/)
    end
  end
end
