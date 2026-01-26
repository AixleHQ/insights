# frozen_string_literal: true

module Ai
  class AnthropicAdapter
    BASE_URL = 'https://api.anthropic.com/v1'
    DEFAULT_MODEL = 'claude-3-5-sonnet-20241022'
    API_VERSION = '2023-06-01'

    # Pricing per million tokens (as of 2024)
    PRICING = {
      'claude-3-5-sonnet-20241022' => { prompt: 3.00, completion: 15.00 },
      'claude-3-5-haiku-20241022' => { prompt: 1.00, completion: 5.00 },
      'claude-3-opus-20240229' => { prompt: 15.00, completion: 75.00 },
      'claude-3-sonnet-20240229' => { prompt: 3.00, completion: 15.00 },
      'claude-3-haiku-20240307' => { prompt: 0.25, completion: 1.25 }
    }.freeze

    class << self
      def default_model
        DEFAULT_MODEL
      end

      def chat(api_key:, messages:, model:, options: {})
        # Convert OpenAI-style messages to Anthropic format
        system_message = messages.find { |m| m[:role] == 'system' || m['role'] == 'system' }
        user_messages = messages.reject { |m| m[:role] == 'system' || m['role'] == 'system' }

        body = {
          model: model,
          messages: format_messages(user_messages),
          max_tokens: options[:max_tokens] || 4096
        }
        body[:system] = system_message[:content] || system_message['content'] if system_message
        body[:temperature] = options[:temperature] if options[:temperature]
        body[:top_p] = options[:top_p] if options[:top_p]

        response = make_request(
          api_key: api_key,
          endpoint: '/messages',
          body: body
        )

        parse_chat_response(response, model)
      end

      def completion(api_key:, prompt:, model:, options: {})
        chat(
          api_key: api_key,
          messages: [{ role: 'user', content: prompt }],
          model: model,
          options: options
        )
      end

      def list_models(api_key:)
        # Anthropic doesn't have a list models endpoint, return known models
        PRICING.keys.map do |model_id|
          {
            id: model_id,
            name: model_id.split('-').map(&:capitalize).join(' '),
            context_length: model_id.include?('opus') ? 200_000 : 200_000,
            pricing: PRICING[model_id]
          }
        end
      end

      private

      def make_request(api_key:, endpoint:, body:)
        uri = URI("#{BASE_URL}#{endpoint}")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true

        request = Net::HTTP::Post.new(uri)
        request['x-api-key'] = api_key
        request['anthropic-version'] = API_VERSION
        request['Content-Type'] = 'application/json'
        request.body = body.to_json

        response = http.request(request)
        handle_response(response)
      end

      def handle_response(response)
        body = JSON.parse(response.body)

        case response.code.to_i
        when 200..299
          body
        when 401
          raise AuthenticationError.new('Invalid API key', status: 401, provider: 'anthropic')
        when 429
          raise RateLimitError.new('Rate limit exceeded', status: 429, provider: 'anthropic')
        when 400
          raise InvalidRequestError.new(body.dig('error', 'message'), status: 400, provider: 'anthropic', response_body: body)
        else
          raise ApiError.new(body.dig('error', 'message') || 'Unknown error', status: response.code.to_i, provider: 'anthropic', response_body: body)
        end
      end

      def format_messages(messages)
        messages.map do |msg|
          {
            role: msg[:role] || msg['role'],
            content: msg[:content] || msg['content']
          }
        end
      end

      def parse_chat_response(response, model)
        content_block = response['content']&.first
        usage = response['usage'] || {}

        prompt_tokens = usage['input_tokens'] || 0
        completion_tokens = usage['output_tokens'] || 0

        {
          id: response['id'],
          model: response['model'] || model,
          content: content_block&.dig('text'),
          finish_reason: response['stop_reason'],
          usage: {
            prompt_tokens: prompt_tokens,
            completion_tokens: completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
            cost: calculate_cost(model, prompt_tokens, completion_tokens)
          }
        }
      end

      def calculate_cost(model, prompt_tokens, completion_tokens)
        pricing = PRICING[model]
        return nil unless pricing

        prompt_cost = (prompt_tokens / 1_000_000.0) * pricing[:prompt]
        completion_cost = (completion_tokens / 1_000_000.0) * pricing[:completion]
        prompt_cost + completion_cost
      end
    end
  end
end
