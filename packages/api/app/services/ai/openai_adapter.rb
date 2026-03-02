# frozen_string_literal: true

module Ai
  class OpenaiAdapter
    BASE_URL = "https://api.openai.com/v1"
    DEFAULT_MODEL = "gpt-4o"

    # Pricing per million tokens (as of 2024)
    PRICING = {
      "gpt-4o" => { prompt: 5.00, completion: 15.00 },
      "gpt-4o-mini" => { prompt: 0.15, completion: 0.60 },
      "gpt-4-turbo" => { prompt: 10.00, completion: 30.00 },
      "gpt-4" => { prompt: 30.00, completion: 60.00 },
      "gpt-3.5-turbo" => { prompt: 0.50, completion: 1.50 },
      "o1-preview" => { prompt: 15.00, completion: 60.00 },
      "o1-mini" => { prompt: 3.00, completion: 12.00 }
    }.freeze

    class << self
      def default_model
        DEFAULT_MODEL
      end

      def chat(api_key:, messages:, model:, options: {})
        response = make_request(
          api_key: api_key,
          endpoint: "/chat/completions",
          body: {
            model: model,
            messages: format_messages(messages),
            **options.slice(:temperature, :max_tokens, :top_p, :stream)
          }
        )

        parse_chat_response(response, model)
      end

      def completion(api_key:, prompt:, model:, options: {})
        chat(
          api_key: api_key,
          messages: [ { role: "user", content: prompt } ],
          model: model,
          options: options
        )
      end

      def list_models(api_key:)
        response = make_request(
          api_key: api_key,
          endpoint: "/models",
          method: :get
        )

        # Filter to only chat models
        response["data"]
          .select { |m| m["id"].match?(/^(gpt-|o1-)/) }
          .map do |model|
            {
              id: model["id"],
              name: model["id"],
              context_length: infer_context_length(model["id"]),
              pricing: PRICING[model["id"]]
            }
          end
      end

      private

      def make_request(api_key:, endpoint:, body: nil, method: :post)
        uri = URI("#{BASE_URL}#{endpoint}")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true

        request = build_request(method, uri, body)
        request["Authorization"] = "Bearer #{api_key}"
        request["Content-Type"] = "application/json"

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
        when 401
          raise AuthenticationError.new("Invalid API key", status: 401, provider: "openai")
        when 429
          raise RateLimitError.new("Rate limit exceeded", status: 429, provider: "openai")
        when 400
          raise InvalidRequestError.new(body.dig("error", "message"), status: 400, provider: "openai", response_body: body)
        else
          raise ApiError.new(body.dig("error", "message") || "Unknown error", status: response.code.to_i, provider: "openai", response_body: body)
        end
      end

      def format_messages(messages)
        messages.map do |msg|
          {
            role: msg[:role] || msg["role"],
            content: msg[:content] || msg["content"]
          }
        end
      end

      def parse_chat_response(response, model)
        choice = response["choices"]&.first
        usage = response["usage"] || {}

        prompt_tokens = usage["prompt_tokens"] || 0
        completion_tokens = usage["completion_tokens"] || 0

        {
          id: response["id"],
          model: response["model"] || model,
          content: choice&.dig("message", "content"),
          finish_reason: choice&.dig("finish_reason"),
          usage: {
            prompt_tokens: prompt_tokens,
            completion_tokens: completion_tokens,
            total_tokens: usage["total_tokens"] || (prompt_tokens + completion_tokens),
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

      def infer_context_length(model_id)
        case model_id
        when /gpt-4o/, /gpt-4-turbo/, /o1/
          128_000
        when /gpt-4/
          8_192
        when /gpt-3.5-turbo/
          16_385
        else
          4_096
        end
      end
    end
  end
end
