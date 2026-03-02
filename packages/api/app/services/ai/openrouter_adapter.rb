# frozen_string_literal: true

module Ai
  class OpenrouterAdapter
    BASE_URL = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL = "anthropic/claude-3.5-sonnet"

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
            messages: messages,
            **options.slice(:temperature, :max_tokens, :top_p, :stream)
          }
        )

        parse_chat_response(response, model)
      end

      def completion(api_key:, prompt:, model:, options: {})
        # OpenRouter uses chat format for completions
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

        response["data"].map do |model|
          {
            id: model["id"],
            name: model["name"],
            context_length: model["context_length"],
            pricing: {
              prompt: model.dig("pricing", "prompt"),
              completion: model.dig("pricing", "completion")
            }
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
        request["HTTP-Referer"] = ENV.fetch("APP_URL", "https://db90.dev")
        request["X-Title"] = "DB90"

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
          raise AuthenticationError.new("Invalid API key", status: 401, provider: "openrouter")
        when 429
          raise RateLimitError.new("Rate limit exceeded", status: 429, provider: "openrouter")
        when 400
          raise InvalidRequestError.new(body["error"]["message"], status: 400, provider: "openrouter", response_body: body)
        else
          raise ApiError.new(body["error"]["message"] || "Unknown error", status: response.code.to_i, provider: "openrouter", response_body: body)
        end
      end

      def parse_chat_response(response, model)
        choice = response["choices"]&.first
        usage = response["usage"] || {}

        {
          id: response["id"],
          model: response["model"] || model,
          content: choice&.dig("message", "content"),
          finish_reason: choice&.dig("finish_reason"),
          usage: {
            prompt_tokens: usage["prompt_tokens"] || 0,
            completion_tokens: usage["completion_tokens"] || 0,
            total_tokens: usage["total_tokens"] || 0,
            cost: calculate_cost(model, usage["prompt_tokens"] || 0, usage["completion_tokens"] || 0)
          }
        }
      end

      def calculate_cost(model, prompt_tokens, completion_tokens)
        # OpenRouter provides cost in the response, but we can estimate if needed
        # Prices are per million tokens
        nil # Cost should come from OpenRouter's response
      end
    end
  end
end
