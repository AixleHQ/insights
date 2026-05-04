# frozen_string_literal: true

module Api
  module V1
    # Receives OpenRouter Broadcast Webhook traces in OTLP JSON format.
    #
    # OpenRouter sends a POST after every API request made through a connector
    # that has Broadcast > Webhook enabled in its OpenRouter account settings.
    # The payload is an OTLP resourceSpans envelope; each span corresponds to
    # one generation (one API call).
    #
    # Route: POST /api/v1/webhooks/openrouter_traces
    # Auth: public endpoint — no Keycloak JWT required.
    #       Connector is resolved via SHA-256(api_key) present in span attributes.
    #       Optional HMAC signature verification when connector.webhook_secret is set.
    class OpenrouterTracesController < ApplicationController
      skip_before_action :authenticate_user!
      skip_before_action :set_current_organization

      SIGNATURE_HEADER = "X-Openrouter-Signature"
      TEST_CONNECTION_HEADER = "X-Test-Connection"

      # POST /api/v1/webhooks/openrouter_traces
      def receive
        # OpenRouter sends a test request on webhook setup — acknowledge and stop.
        if request.headers[TEST_CONNECTION_HEADER] == "true"
          return render json: { received: true }, status: :ok
        end

        payload = parse_otlp_payload
        return render json: { error: "Invalid payload" }, status: :bad_request if payload.nil?

        key_hash = extract_key_hash(payload)
        connector = OrganizationConnector.by_key_hash(key_hash)
                                         .where(connector_type: "openrouter", is_active: true)
                                         .first

        unless connector
          # Return 200 so OpenRouter doesn't retry unknown-key payloads.
          Rails.logger.warn("[OpenrouterTraces] No active connector found for key_hash=#{key_hash&.first(8)}...")
          return render json: { received: true }, status: :ok
        end

        verify_hmac!(connector) if connector.webhook_secret.present?

        OpenrouterTraceJob.perform_async(connector.id, payload.to_json)

        render json: { received: true }, status: :accepted
      rescue InvalidSignatureError => e
        render json: { error: "Invalid signature", message: e.message }, status: :unauthorized
      rescue StandardError => e
        Rails.logger.error("[OpenrouterTraces] Unexpected error: #{e.class} #{e.message}")
        render json: { error: "Processing failed" }, status: :internal_server_error
      end

      private

      InvalidSignatureError = Class.new(StandardError)

      def parse_otlp_payload
        return nil unless request.content_type&.include?("application/json")
        JSON.parse(request.raw_post)
      rescue JSON::ParserError
        nil
      end

      # OpenRouter includes the SHA-256 hash of the API key that originated the
      # request as a span attribute so the receiver can route to the right account.
      def extract_key_hash(payload)
        spans(payload).each do |span|
          attrs = span_attributes(span)
          hash = attrs["openrouter.api_key_hash"] || attrs["gen_ai.openrouter.api_key_hash"]
          return hash if hash.present?
        end
        nil
      end

      def verify_hmac!(connector)
        signature = request.headers[SIGNATURE_HEADER]
        raise InvalidSignatureError, "Missing #{SIGNATURE_HEADER} header" if signature.blank?

        expected = OpenSSL::HMAC.hexdigest("SHA256", connector.webhook_secret, request.raw_post)
        unless ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s)
          raise InvalidSignatureError, "Signature mismatch"
        end
      end

      def spans(payload)
        Array(payload["resourceSpans"]).flat_map do |rs|
          Array(rs["scopeSpans"]).flat_map { |ss| Array(ss["spans"]) }
        end
      end

      def span_attributes(span)
        Array(span["attributes"]).each_with_object({}) do |attr, hash|
          key = attr["key"]
          value = attr.dig("value", "stringValue") ||
                  attr.dig("value", "intValue") ||
                  attr.dig("value", "doubleValue") ||
                  attr.dig("value", "boolValue")
          hash[key] = value if key
        end
      end
    end
  end
end
