# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Ai::ProxyService do
  describe '.for' do
    it 'returns OpenrouterAdapter for openrouter provider' do
      expect(described_class.for('openrouter')).to eq(Ai::OpenrouterAdapter)
    end

    it 'returns AnthropicAdapter for anthropic provider' do
      expect(described_class.for('anthropic')).to eq(Ai::AnthropicAdapter)
    end

    it 'returns OpenaiAdapter for openai provider' do
      expect(described_class.for('openai')).to eq(Ai::OpenaiAdapter)
    end

    it 'returns GeminiAdapter for gemini provider' do
      expect(described_class.for('gemini')).to eq(Ai::GeminiAdapter)
    end

    it 'raises ArgumentError for unknown provider' do
      expect { described_class.for('unknown') }.to raise_error(ArgumentError, /Unknown AI provider/)
    end
  end

  describe '.supported_providers' do
    it 'returns all supported providers' do
      expect(described_class.supported_providers).to contain_exactly('openrouter', 'anthropic', 'openai', 'gemini')
    end
  end

  describe '.chat' do
    let(:organization) { create(:organization) }
    let(:connector) { create(:organization_connector, organization: organization, connector_type: 'anthropic') }
    let(:messages) { [ { role: 'user', content: 'Hello' } ] }

    before do
      allow(Ai::AnthropicAdapter).to receive(:chat).and_return({
        id: 'msg_123',
        model: 'claude-3-sonnet',
        content: 'Hello! How can I help?',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.001
        }
      })
    end

    it 'delegates to the appropriate adapter' do
      expect(Ai::AnthropicAdapter).to receive(:chat).with(
        api_key: connector.access_token,
        messages: messages,
        model: Ai::AnthropicAdapter.default_model,
        options: {}
      )

      described_class.chat(
        provider: 'anthropic',
        connector: connector,
        messages: messages
      )
    end

    it 'tracks usage in ToolEvent' do
      expect {
        described_class.chat(
          provider: 'anthropic',
          connector: connector,
          messages: messages
        )
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.last
      expect(event.tool_name).to eq('anthropic_api')
      expect(event.event_type).to eq('chat')
      expect(event.tokens_in).to eq(10)
      expect(event.tokens_out).to eq(20)
    end

    it 'calculates cost_usd via ModelPricingService (not adapter PRICING)' do
      described_class.chat(provider: 'anthropic', connector: connector, messages: messages)

      expected_cost = ModelPricingService.calculate_cost(
        tokens_in: 10,
        tokens_out: 20,
        model: 'claude-3-sonnet',
        organization: organization
      )[:total_cost]

      expect(ToolEvent.last.cost_usd).to be_within(0.000001).of(expected_cost)
    end
  end

  describe '.chat — Gemini provider' do
    let(:organization) { create(:organization) }
    let(:connector) { create(:organization_connector, organization: organization, connector_type: 'gemini') }
    let(:messages) { [ { role: 'user', content: 'Hello' } ] }

    before do
      allow(Ai::GeminiAdapter).to receive(:chat).and_return({
        id: SecureRandom.uuid,
        model: 'gemini-1.5-pro',
        content: 'Hello from Gemini!',
        finish_reason: 'STOP',
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15,
          cost: nil
        }
      })
    end

    it 'creates a ToolEvent with tool_name gemini_api and event_type chat' do
      expect {
        described_class.chat(provider: 'gemini', connector: connector, messages: messages)
      }.to change(ToolEvent, :count).by(1)

      event = ToolEvent.last
      expect(event.tool_name).to eq('gemini_api')
      expect(event.event_type).to eq('chat')
    end

    it 'calculates cost_usd via ModelPricingService even when adapter returns nil cost' do
      described_class.chat(provider: 'gemini', connector: connector, messages: messages)

      expected_cost = ModelPricingService.calculate_cost(
        tokens_in: 5,
        tokens_out: 10,
        model: 'gemini-1.5-pro',
        organization: organization
      )[:total_cost]

      expect(ToolEvent.last.cost_usd).to be_within(0.000001).of(expected_cost)
    end

    it 'stores the correct model and token counts' do
      described_class.chat(provider: 'gemini', connector: connector, messages: messages)

      event = ToolEvent.last
      expect(event.model).to eq('gemini-1.5-pro')
      expect(event.tokens_in).to eq(5)
      expect(event.tokens_out).to eq(10)
      expect(event.tokens_total).to eq(15)
    end
  end
end

RSpec.describe Ai::AnthropicAdapter do
  describe '.default_model' do
    it 'returns the default model' do
      expect(described_class.default_model).to eq('claude-3-5-sonnet-20241022')
    end
  end

  describe '.list_models' do
    it 'returns known Anthropic models' do
      models = described_class.list_models(api_key: 'test-key')

      expect(models).to be_an(Array)
      expect(models.first).to have_key(:id)
      expect(models.first).to have_key(:pricing)
    end
  end
end

RSpec.describe Ai::OpenaiAdapter do
  describe '.default_model' do
    it 'returns gpt-4o' do
      expect(described_class.default_model).to eq('gpt-4o')
    end
  end
end

RSpec.describe Ai::GeminiAdapter do
  describe '.default_model' do
    it 'returns gemini-1.5-pro' do
      expect(described_class.default_model).to eq('gemini-1.5-pro')
    end
  end

  describe '.list_models' do
    let(:api_response) do
      {
        "models" => [
          { "name" => "models/gemini-1.5-pro", "displayName" => "Gemini 1.5 Pro", "inputTokenLimit" => 1_048_576 },
          { "name" => "models/gemini-2.5-flash", "displayName" => "Gemini 2.5 Flash", "inputTokenLimit" => 1_048_576 },
          { "name" => "models/text-bison-001", "displayName" => "PaLM 2", "inputTokenLimit" => 8192 }
        ]
      }
    end

    before do
      allow(described_class).to receive(:make_request).and_return(api_response)
    end

    it 'filters to gemini models only' do
      models = described_class.list_models(api_key: 'test-key')
      expect(models.map { |m| m[:id] }).to contain_exactly('gemini-1.5-pro', 'gemini-2.5-flash')
    end

    it 'delegates pricing to ModelPricingService' do
      expect(ModelPricingService).to receive(:pricing_for_model).with('gemini-1.5-pro').and_call_original
      expect(ModelPricingService).to receive(:pricing_for_model).with('gemini-2.5-flash').and_call_original
      described_class.list_models(api_key: 'test-key')
    end

    it 'returns prompt/completion pricing keys shaped for API consumers' do
      models = described_class.list_models(api_key: 'test-key')
      pro = models.find { |m| m[:id] == 'gemini-1.5-pro' }
      expect(pro[:pricing]).to eq({ prompt: 1.25, completion: 5.00 })
    end

    it 'strips the models/ prefix from the id' do
      models = described_class.list_models(api_key: 'test-key')
      expect(models.map { |m| m[:id] }).to all(satisfy { |id| !id.start_with?('models/') })
    end
  end
end

RSpec.describe Ai::OpenrouterAdapter do
  describe '.default_model' do
    it 'returns anthropic/claude-3.5-sonnet' do
      expect(described_class.default_model).to eq('anthropic/claude-3.5-sonnet')
    end
  end
end
