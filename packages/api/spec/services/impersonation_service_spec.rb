# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ImpersonationService do
  let(:admin) { create(:user, :global_admin) }
  let(:target) { create(:user) }

  describe '.generate_token' do
    subject(:token) { described_class.generate_token(admin_user: admin, target_user: target) }

    it 'returns a JWT string' do
      expect(token).to be_a(String)
      expect(token.split('.').length).to eq(3)
    end

    it 'includes expected claims' do
      payload = JWT.decode(token, nil, false).first

      expect(payload['sub']).to eq(target.keycloak_sub)
      expect(payload['email']).to eq(target.email)
      expect(payload['impersonator_id']).to eq(admin.id)
      expect(payload['impersonator_email']).to eq(admin.email)
      expect(payload['iss']).to eq('db90-impersonation')
    end

    it 'includes a jti claim' do
      payload = JWT.decode(token, nil, false).first

      expect(payload['jti']).to be_present
    end

    it 'sets exp approximately 1 hour from now' do
      payload = JWT.decode(token, nil, false).first

      expect(payload['exp']).to be_within(5).of(1.hour.from_now.to_i)
    end
  end

  describe '.decode_token' do
    let(:token) { described_class.generate_token(admin_user: admin, target_user: target) }

    it 'returns claims for a valid token' do
      claims = described_class.decode_token(token)

      expect(claims).to be_a(Hash)
      expect(claims['email']).to eq(target.email)
    end

    it 'returns nil for an expired token' do
      expired_payload = {
        sub: target.keycloak_sub,
        email: target.email,
        iss: 'db90-impersonation',
        exp: 1.hour.ago.to_i,
        iat: 2.hours.ago.to_i,
        jti: SecureRandom.uuid
      }
      secret = Rails.application.credentials.secret_key_base ||
               ENV.fetch('SECRET_KEY_BASE', 'development_secret_key_for_impersonation')
      expired_token = JWT.encode(expired_payload, secret, 'HS256')

      expect(described_class.decode_token(expired_token)).to be_nil
    end

    it 'returns nil for a token signed with the wrong secret' do
      bad_token = JWT.encode({ sub: 'x', iss: 'db90-impersonation', exp: 1.hour.from_now.to_i }, 'wrong_secret', 'HS256')

      expect(described_class.decode_token(bad_token)).to be_nil
    end

    it 'returns nil for a Keycloak token (wrong iss)' do
      secret = Rails.application.credentials.secret_key_base ||
               ENV.fetch('SECRET_KEY_BASE', 'development_secret_key_for_impersonation')
      keycloak_like = JWT.encode({ sub: 'x', iss: 'http://keycloak/realms/db90', exp: 1.hour.from_now.to_i }, secret, 'HS256')

      expect(described_class.decode_token(keycloak_like)).to be_nil
    end
  end

  describe '.revoke_token and .revoked?' do
    let(:jti) { SecureRandom.uuid }
    let(:exp) { 1.hour.from_now.to_i }

    after { REDIS.del("impersonation:jti:#{jti}") }

    it 'returns false for a jti that has not been revoked' do
      expect(described_class.revoked?(jti)).to be false
    end

    it 'returns true after revoking a jti' do
      described_class.revoke_token(jti, exp)

      expect(described_class.revoked?(jti)).to be true
    end

    it 'sets a TTL on the Redis key' do
      described_class.revoke_token(jti, exp)
      ttl = REDIS.ttl("impersonation:jti:#{jti}")

      expect(ttl).to be_between(1, 3600)
    end

    it 'does nothing when the token is already expired (ttl <= 0)' do
      past_exp = 1.minute.ago.to_i
      described_class.revoke_token(jti, past_exp)

      expect(described_class.revoked?(jti)).to be false
    end

    it 'returns false for a blank jti' do
      expect(described_class.revoked?(nil)).to be false
      expect(described_class.revoked?('')).to be false
    end
  end

  describe 'Redis failure resilience' do
    let(:jti) { SecureRandom.uuid }
    let(:exp) { 1.hour.from_now.to_i }

    before do
      allow(REDIS).to receive(:exists?).and_raise(Redis::CannotConnectError, 'Connection refused')
      allow(REDIS).to receive(:setex).and_raise(Redis::CannotConnectError, 'Connection refused')
    end

    it 'revoked? returns false when Redis is unavailable' do
      expect(described_class.revoked?(jti)).to be false
    end

    it 'revoke_token does not raise when Redis is unavailable' do
      expect { described_class.revoke_token(jti, exp) }.not_to raise_error
    end
  end
end
