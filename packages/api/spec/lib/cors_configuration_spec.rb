# frozen_string_literal: true

require 'rails_helper'

RSpec.describe CorsConfiguration do
  describe '.allowed_origins' do
    around do |example|
      original_frontend_url = ENV['FRONTEND_URL']
      example.run
      ENV['FRONTEND_URL'] = original_frontend_url
    end

    context 'in production' do
      before do
        allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new('production'))
        ENV['FRONTEND_URL'] = 'https://app.insights.example.com'
      end

      it 'returns only the configured FRONTEND_URL' do
        expect(described_class.allowed_origins).to eq([ 'https://app.insights.example.com' ])
      end
    end

    context 'in staging' do
      before do
        allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new('staging'))
        ENV['FRONTEND_URL'] = 'https://insights.example.com'
      end

      it 'returns only the configured FRONTEND_URL' do
        expect(described_class.allowed_origins).to eq([ 'https://insights.example.com' ])
      end
    end

    context 'in development' do
      it 'returns the hardcoded local dev origins' do
        expect(described_class.allowed_origins).to eq([
          'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'
        ])
      end
    end

    context 'in test' do
      it 'returns the hardcoded local dev origins' do
        expect(described_class.allowed_origins).to eq([
          'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'
        ])
      end
    end
  end
end
