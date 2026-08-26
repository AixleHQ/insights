# frozen_string_literal: true

require 'rails_helper'

RSpec.describe TestJwtAuthMiddleware do
  describe '.enabled?' do
    around do |example|
      original = ENV['ALLOW_TEST_AUTH_MIDDLEWARE']
      example.run
      ENV['ALLOW_TEST_AUTH_MIDDLEWARE'] = original
    end

    it 'is true under the real test bootstrap (Rails.env.test? and the flag set by rails_helper.rb)' do
      expect(described_class.enabled?).to eq(true)
    end

    it 'is false if the ALLOW_TEST_AUTH_MIDDLEWARE flag is unset, even though Rails.env.test? is true' do
      ENV.delete('ALLOW_TEST_AUTH_MIDDLEWARE')
      expect(described_class.enabled?).to eq(false)
    end

    it 'is false if Rails.env.test? is false, even if the flag is set' do
      ENV['ALLOW_TEST_AUTH_MIDDLEWARE'] = '1'
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new('production'))
      expect(described_class.enabled?).to eq(false)
    end
  end

  describe '#call' do
    let(:app) { ->(env) { [ 200, {}, [ 'OK' ] ] } }
    let(:middleware) { described_class.new(app) }
    let(:user) { create(:user) }

    context 'when disabled (flag unset)' do
      around do |example|
        original = ENV['ALLOW_TEST_AUTH_MIDDLEWARE']
        ENV.delete('ALLOW_TEST_AUTH_MIDDLEWARE')
        example.run
        ENV['ALLOW_TEST_AUTH_MIDDLEWARE'] = original
      end

      it 'does not set jwt.claims even with a valid test-token header' do
        env = Rack::MockRequest.env_for('/api/v1/users', 'HTTP_AUTHORIZATION' => "Bearer test-token-for-#{user.id}")
        middleware.call(env)
        expect(env['jwt.claims']).to be_nil
      end
    end

    context 'when enabled (real test bootstrap)' do
      it 'sets jwt.claims for a valid test-token header' do
        env = Rack::MockRequest.env_for('/api/v1/users', 'HTTP_AUTHORIZATION' => "Bearer test-token-for-#{user.id}")
        middleware.call(env)
        expect(env['jwt.claims']['sub']).to eq(user.keycloak_sub)
      end
    end
  end
end
