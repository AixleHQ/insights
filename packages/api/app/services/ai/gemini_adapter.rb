# frozen_string_literal: true

module Ai
  class GeminiAdapter
    BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
    DEFAULT_MODEL = 'gemini-1.5-pro'

    # Pricing per million tokens (as of 2024)
    PRICING = {
      'gemini-1.5-pro' => { prompt: 1.25, completion: 5.00 },
      'gemini-1.5-flash' => { prompt: 0.075, completion: 0.30 },
      'gemini-1.0-pro' => { prompt: 0.50, completion: 1.50 }
    }.freeze

    class << self
      def default_model
        DEFAULT_MODEL
      end

      def chat(api_key:, messages:, model:, options: {})
        # Extract system message if present
        system_message = messages.find { |m| m[:role] == 'system' || m['role'] == 'system' }
        user_messages = messages.reject { |m| m[:role] == 'system' || m['role'] == 'system' }

        body = {
          contents: format_messages(user_messages),
          generationConfig: {
            temperature: options[:temperature],
            maxOutputTokens: options[:max_tokens],
            topP: options[:top_p]
          }.compact
        }
        body[:systemInstruction] = { parts: [{ text: system_message[:content] || system_message['content'] }] } if system_message

        response = make_request(
          api_key: api_key,
          endpoint: "/models/#{model}:generateContent",
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
        response = make_request(
          api_key: api_key,
          endpoint: '/models',
          method: :get
        )

        response['models']
          .select { |m| m['name'].include?('gemini') }
          .map do |model|
            model_id = model['name'].sub('models/', '')
            {
              id: model_id,
              name: model['displayName'],
              context_length: model['inputTokenLimit'],
              pricing: PRICING[model_id]
            }
          end
      end

      private

      def make_request(api_key:, endpoint:, body: nil, method: :post)
        uri = URI("#{BASE_URL}#{endpoint}")
        uri.query = "key=#{api_key}"
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true

        request = build_request(method, uri, body)
        request['Content-Type'] = 'application/json'

        response = http.request(request)
        handle_response(response)
      end

      def build_request(method, uri, body)
        case method
        when :get
          Net::HTTP::Get.new(uri)
        when :post
          req = Net::HTTP::Post.new(uri)
          req.body = body.to_json if body
          req
        end
      end

      def handle_response(response)
        body = JSON.parse(response.body)

        case response.code.to_i
        when 200..299
          body
        when 401, 403
          raise AuthenticationError.new('Invalid API key', status: response.code.to_i, provider: 'gemini')
        when 429
          raise RateLimitError.new('Rate limit exceeded', status: 429, provider: 'gemini')
        when 400
          raise InvalidRequestError.new(body.dig('error', 'message'), status: 400, provider: 'gemini', response_body: body)
        else
          raise ApiError.new(body.dig('error', 'message') || 'Unknown error', status: response.code.to_i, provider: 'gemini', response_body: body)
        end
      end

      def format_messages(messages)
        messages.map do |msg|
          role = msg[:role] || msg['role']
          content = msg[:content] || msg['content']

          {
            role: role == 'assistant' ? 'model' : 'user',
            parts: [{ text: content }]
          }
        end
      end

      def parse_chat_response(response, model)
        candidate = response['candidates']&.first
        content = candidate&.dig('content', 'parts')&.first&.dig('text')
        usage = response['usageMetadata'] || {}

        prompt_tokens = usage['promptTokenCount'] || 0
        completion_tokens = usage['candidatesTokenCount'] || 0

        {
          id: SecureRandom.uuid, # Gemini doesn't return an ID
          model: model,
          content: content,
          finish_reason: candidate&.dig('finishReason'),
          usage: {
            prompt_tokens: prompt_tokens,
            completion_tokens: completion_tokens,
            total_tokens: usage['totalTokenCount'] || (prompt_tokens + completion_tokens),
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
