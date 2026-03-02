# frozen_string_literal: true

module Api
  module V1
    class AiGatewayController < BaseController
      before_action :require_organization!
      before_action :set_connector
      before_action :check_rate_limit!

      # POST /api/v1/organizations/:organization_id/ai/:provider/completions
      def completions
        authorize! @connector, to: :use?

        result = Ai::ProxyService.completion(
          provider: params[:provider],
          connector: @connector,
          prompt: params[:prompt],
          model: params[:model],
          options: completion_options
        )

        render json: { data: format_completion_response(result) }
      rescue Ai::RateLimitError => e
        render json: { error: "Rate Limited", message: e.message }, status: :too_many_requests
      rescue Ai::AuthenticationError => e
        render json: { error: "Authentication Failed", message: e.message }, status: :unauthorized
      rescue Ai::InvalidRequestError => e
        render json: { error: "Invalid Request", message: e.message }, status: :bad_request
      rescue Ai::ApiError => e
        render json: { error: "API Error", message: e.message }, status: :bad_gateway
      end

      # POST /api/v1/organizations/:organization_id/ai/:provider/chat
      def chat
        authorize! @connector, to: :use?

        result = Ai::ProxyService.chat(
          provider: params[:provider],
          connector: @connector,
          messages: params[:messages],
          model: params[:model],
          options: chat_options
        )

        render json: { data: format_chat_response(result) }
      rescue Ai::RateLimitError => e
        render json: { error: "Rate Limited", message: e.message }, status: :too_many_requests
      rescue Ai::AuthenticationError => e
        render json: { error: "Authentication Failed", message: e.message }, status: :unauthorized
      rescue Ai::InvalidRequestError => e
        render json: { error: "Invalid Request", message: e.message }, status: :bad_request
      rescue Ai::ApiError => e
        render json: { error: "API Error", message: e.message }, status: :bad_gateway
      end

      # GET /api/v1/organizations/:organization_id/ai/:provider/models
      def models
        authorize! @connector, to: :show?

        models = Ai::ProxyService.list_models(
          provider: params[:provider],
          connector: @connector
        )

        render json: { data: models }
      rescue Ai::AuthenticationError => e
        render json: { error: "Authentication Failed", message: e.message }, status: :unauthorized
      rescue Ai::ApiError => e
        render json: { error: "API Error", message: e.message }, status: :bad_gateway
      end

      private

      def set_connector
        provider = params[:provider]

        unless Ai::ProxyService.supported_providers.include?(provider)
          return render json: {
            error: "Bad Request",
            message: "Unsupported AI provider: #{provider}"
          }, status: :bad_request
        end

        @connector = current_organization.organization_connectors
                                         .where(connector_type: provider, is_active: true)
                                         .first

        unless @connector
          render json: {
            error: "Not Found",
            message: "No active #{provider} connector found for this organization"
          }, status: :not_found
        end
      end

      def check_rate_limit!
        return unless rate_limit_enabled?

        key = rate_limit_key
        current_count = Rails.cache.read(key).to_i

        if current_count >= rate_limit_max_requests
          render json: {
            error: "Rate Limited",
            message: "Too many requests. Please try again later.",
            retry_after: rate_limit_window
          }, status: :too_many_requests
          return
        end

        Rails.cache.write(key, current_count + 1, expires_in: rate_limit_window)
      end

      def completion_options
        params.permit(:temperature, :max_tokens, :top_p).to_h.symbolize_keys
      end

      def chat_options
        params.permit(:temperature, :max_tokens, :top_p, :stream).to_h.symbolize_keys
      end

      def format_completion_response(result)
        {
          id: result[:id],
          model: result[:model],
          content: result[:content],
          finish_reason: result[:finish_reason],
          usage: result[:usage]
        }
      end

      def format_chat_response(result)
        {
          id: result[:id],
          model: result[:model],
          message: {
            role: "assistant",
            content: result[:content]
          },
          finish_reason: result[:finish_reason],
          usage: result[:usage]
        }
      end

      def rate_limit_enabled?
        ENV.fetch("AI_GATEWAY_RATE_LIMIT_ENABLED", "true") == "true"
      end

      def rate_limit_key
        "ai_gateway:#{current_organization.id}:#{current_user.id}:#{params[:provider]}"
      end

      def rate_limit_max_requests
        ENV.fetch("AI_GATEWAY_RATE_LIMIT_MAX", 100).to_i
      end

      def rate_limit_window
        ENV.fetch("AI_GATEWAY_RATE_LIMIT_WINDOW", 60).to_i.seconds
      end
    end
  end
end
