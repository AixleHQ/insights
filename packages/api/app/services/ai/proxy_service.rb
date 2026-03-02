# frozen_string_literal: true

module Ai
  class ProxyService
    ADAPTER_MAP = {
      "openrouter" => Ai::OpenrouterAdapter,
      "anthropic" => Ai::AnthropicAdapter,
      "openai" => Ai::OpenaiAdapter,
      "gemini" => Ai::GeminiAdapter
    }.freeze

    class << self
      def for(provider)
        adapter_class = ADAPTER_MAP[provider.to_s]
        raise ArgumentError, "Unknown AI provider: #{provider}" unless adapter_class

        adapter_class
      end

      def chat(provider:, connector:, messages:, model: nil, options: {})
        adapter = self.for(provider)

        start_time = Time.current
        response = adapter.chat(
          api_key: connector.access_token,
          messages: messages,
          model: model || adapter.default_model,
          options: options
        )
        duration = Time.current - start_time

        track_usage(
          connector: connector,
          provider: provider,
          operation: "chat",
          model: response[:model],
          tokens_in: response[:usage][:prompt_tokens],
          tokens_out: response[:usage][:completion_tokens],
          duration: duration,
          cost: response[:usage][:cost]
        )

        response
      end

      def completion(provider:, connector:, prompt:, model: nil, options: {})
        adapter = self.for(provider)

        start_time = Time.current
        response = adapter.completion(
          api_key: connector.access_token,
          prompt: prompt,
          model: model || adapter.default_model,
          options: options
        )
        duration = Time.current - start_time

        track_usage(
          connector: connector,
          provider: provider,
          operation: "completion",
          model: response[:model],
          tokens_in: response[:usage][:prompt_tokens],
          tokens_out: response[:usage][:completion_tokens],
          duration: duration,
          cost: response[:usage][:cost]
        )

        response
      end

      def list_models(provider:, connector:)
        adapter = self.for(provider)
        adapter.list_models(api_key: connector.access_token)
      end

      def supported_providers
        ADAPTER_MAP.keys
      end

      private

      def track_usage(connector:, provider:, operation:, model:, tokens_in:, tokens_out:, duration:, cost:)
        ToolEvent.create!(
          organization_id: connector.organization_id,
          user_id: connector.organization.members.first&.id, # Will be replaced by correlation
          tool_name: "#{provider}_api",
          event_type: operation,
          model: model,
          tokens_in: tokens_in,
          tokens_out: tokens_out,
          cost_usd: cost,
          duration_ms: (duration * 1000).round,
          occurred_at: Time.current,
          metadata: {
            connector_id: connector.id,
            provider: provider
          }
        )
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.error("Failed to track AI usage: #{e.message}")
      end
    end
  end

  class ApiError < StandardError
    attr_reader :status, :provider, :response_body

    def initialize(message, status: nil, provider: nil, response_body: nil)
      @status = status
      @provider = provider
      @response_body = response_body
      super(message)
    end
  end

  class RateLimitError < ApiError; end
  class AuthenticationError < ApiError; end
  class InvalidRequestError < ApiError; end
end
