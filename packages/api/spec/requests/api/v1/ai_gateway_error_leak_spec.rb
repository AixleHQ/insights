# frozen_string_literal: true

require "rails_helper"

# AIX-370 AC1 — evidence-grade proof that upstream AI provider error detail
# reaches neither the server log nor the client.
#
# These drive the *real* route end to end and stub each provider at the HTTP
# boundary (WebMock), rather than stubbing Ai::ProxyService. That matters: the
# thing under test is precisely what an adapter's error mapping hands the
# controller, so short-circuiting the adapter would test the mock.
#
# Every stubbed upstream body carries CANARIES — the kinds of value a provider
# genuinely leaks (internal hostname, request id, a key fragment). Each example
# asserts BOTH halves of AC1:
#
#   1. the response equals the fixed generic JSON and contains no canary
#   2. Rails.logger.error retains safe diagnostic metadata and contains no canary
#
# Covers all three providers reachable through the gateway. `anthropic` is
# excluded deliberately: POLLING_ONLY_PROVIDERS makes it 403 before any upstream
# call (ai_gateway_controller.rb:85-96), so it has no error path to leak from.
RSpec.describe "Api::V1::AiGateway upstream error leakage", type: :request do
  let(:user)         { create(:user) }
  let(:organization) { create(:organization) }

  # Canary values planted in every simulated upstream failure.
  CANARY_HOST    = "api-internal-7f3a.provider.example"
  CANARY_REQUEST = "req_canary_9f8a1b2c3d4e5f60"
  CANARY_KEY     = "sk-admin-CANARY-3d4e5f6071829"

  # status => [label, client-facing message, expected HTTP status]
  ERROR_MATRIX = {
    401 => [ "Authentication Failed", "Authentication with the AI provider failed.",                   :unauthorized ],
    429 => [ "Rate Limited",          "Too many requests to the AI provider. Please try again later.",  :too_many_requests ],
    400 => [ "Invalid Request",       "The AI provider rejected the request.",                          :bad_request ],
    503 => [ "API Error",             "The AI provider is currently unavailable. Please try again later.", :bad_gateway ]
  }.freeze

  # Per-provider upstream URLs. Gemini is the odd one out twice over: it carries the
  # API key in the query string rather than an Authorization header, and its chat
  # endpoint embeds the model name.
  PROVIDERS = {
    "openai" => {
      chat:   "https://api.openai.com/v1/chat/completions",
      models: "https://api.openai.com/v1/models"
    },
    "openrouter" => {
      chat:   "https://openrouter.ai/api/v1/chat/completions",
      models: "https://openrouter.ai/api/v1/models"
    },
    "gemini" => {
      chat:   "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
      models: "https://generativelanguage.googleapis.com/v1beta/models"
    }
  }.freeze

  # models only rescues AuthenticationError and ApiError (ai_gateway_controller.rb:66-69).
  ACTIONS = {
    "completions" => { verb: :post, upstream: :chat,   statuses: [ 401, 429, 400, 503 ],
                       params: { prompt: "hello" } },
    "chat"        => { verb: :post, upstream: :chat,   statuses: [ 401, 429, 400, 503 ],
                       params: { messages: [ { role: "user", content: "hello" } ] } },
    "models"      => { verb: :get,  upstream: :models, statuses: [ 401, 503 ], params: {} }
  }.freeze

  def upstream_body(type)
    {
      error: {
        message: "Incorrect API key provided: #{CANARY_KEY}. " \
                 "Upstream host #{CANARY_HOST} rejected the call.",
        type: type,
        request_id: CANARY_REQUEST
      }
    }.to_json
  end

  def canaries = [ CANARY_HOST, CANARY_REQUEST, CANARY_KEY ]

  before do
    create(:organization_membership, user: user, organization: organization, role: "owner")
  end

  PROVIDERS.each do |provider, urls|
    describe "provider: #{provider}" do
      before do
        create(:organization_connector,
               organization: organization,
               connector_type: provider,
               access_token: CANARY_KEY,
               is_active: true)
      end

      ACTIONS.each do |action, config|
        config[:statuses].each do |status|
          label, client_message, expected_status = ERROR_MATRIX.fetch(status)

          context "#{config[:verb].to_s.upcase} #{action} when the provider returns #{status}" do
            let(:body)   { upstream_body(label.parameterize.underscore) }
            let(:logged) { [] }

            before do
              # Two stubs on purpose, and both are load-bearing. WebMock matches the
              # query string, so a bare URL stub does not match gemini (which appends
              # ?key=<api_key>) and a `query:` stub does not match openai/openrouter
              # (which send no query at all). Registering both keeps this table-driven
              # across providers without special-casing gemini.
              verb = config[:verb] == :get ? :get : :post
              url  = urls.fetch(config[:upstream])
              stubbed = { status: status, body: body, headers: { "Content-Type" => "application/json" } }

              stub_request(verb, url).with(query: hash_including({})).to_return(**stubbed)
              stub_request(verb, url).to_return(**stubbed)

              allow(Rails.logger).to receive(:error) { |message| logged << message }
            end

            it "returns the generic #{label} message and leaks nothing to the client" do
              path = "/api/v1/ai/#{provider}/organizations/#{organization.id}/#{action}"
              if config[:verb] == :get
                authenticated_get(path, user: user, organization: organization, params: config[:params])
              else
                authenticated_post(path, user: user, organization: organization, params: config[:params])
              end

              expect(response).to have_http_status(expected_status)
              expect(json_response).to eq({ error: label, message: client_message })

              # The security property — holds for every provider, status and sink.
              canaries.each { |canary| expect(response.body).not_to include(canary) }

              gateway_log = logged.find { |m| m.include?("[AiGateway]") }
              expect(gateway_log).to be_present
              expect(gateway_log).to include("provider=#{provider}").and include("status=#{status}")
              expect(gateway_log).to include("class=Ai::")
              canaries.each { |canary| expect(gateway_log).not_to include(canary) }

              verdict = "PASS — provider detail absent from response and log; " \
                        "safe provider/status/class metadata retained"

            end
          end
        end
      end

      # Auth-failure text is discarded at the adapter boundary as defense in depth:
      # providers can echo the credential that failed, and no future caller should
      # receive that text in an exception message.
      it "never writes API-key material to the log on an auth failure" do
        logged = []
        stubbed = { status: 401, body: upstream_body("authentication_failed"),
                    headers: { "Content-Type" => "application/json" } }
        # Both stubs for the same reason as above — gemini carries ?key=, the others do not.
        stub_request(:get, urls.fetch(:models)).with(query: hash_including({})).to_return(**stubbed)
        stub_request(:get, urls.fetch(:models)).to_return(**stubbed)
        allow(Rails.logger).to receive(:error) { |message| logged << message }

        authenticated_get("/api/v1/ai/#{provider}/organizations/#{organization.id}/models",
                          user: user, organization: organization)

        gateway_log = logged.find { |m| m.include?("[AiGateway]") }

        # The credential appears in the upstream body we simulated, and is the
        # connector's own stored token — it must reach neither sink.
        expect(gateway_log).not_to include(CANARY_KEY)
        expect(response.body).not_to include(CANARY_KEY)

      end
    end
  end
end
