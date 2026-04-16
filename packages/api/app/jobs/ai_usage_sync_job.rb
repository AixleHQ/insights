# frozen_string_literal: true

class AiUsageSyncJob
  include Sidekiq::Job

  sidekiq_options queue: "ai", retry: 3

  SUPPORTED_PROVIDERS = %w[openrouter anthropic openai gemini].freeze

  def perform(organization_id = nil, provider = nil)
    Rails.logger.info("[AiUsageSyncJob] Starting AI usage reconciliation...")

    stats = { organizations_processed: 0, events_reconciled: 0, errors: [] }

    organizations = if organization_id
                      Organization.where(id: organization_id)
    else
                      Organization.all
    end

    organizations.find_each do |org|
      begin
        reconciled = reconcile_organization(org, provider)
        stats[:organizations_processed] += 1
        stats[:events_reconciled] += reconciled
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[AiUsageSyncJob] Error reconciling org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[AiUsageSyncJob] Completed. Processed: #{stats[:organizations_processed]}, Reconciled: #{stats[:events_reconciled]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def reconcile_organization(org, provider_filter = nil)
    total_reconciled = 0

    providers = provider_filter ? [ provider_filter ] : SUPPORTED_PROVIDERS

    providers.each do |provider|
      connector = org.organization_connectors.find_by(connector_type: provider, is_active: true)
      next unless connector

      reconciled = reconcile_provider(org, connector, provider)
      total_reconciled += reconciled
    end

    total_reconciled
  end

  def reconcile_provider(org, connector, provider)
    # Get usage from provider API
    usage_data = fetch_provider_usage(connector, provider)
    return 0 unless usage_data

    reconciled = 0

    # Compare with our recorded events
    usage_data.each do |usage|
      event = find_matching_event(org, provider, usage)

      if event
        # Update if cost differs
        if usage[:cost_usd] && event.cost_usd != usage[:cost_usd]
          event.update!(cost_usd: usage[:cost_usd])
          reconciled += 1
        end
      else
        # Create missing event
        create_event_from_usage(org, provider, usage)
        reconciled += 1
      end
    end

    reconciled
  end

  def fetch_provider_usage(connector, provider)
    case provider
    when "openrouter"
      fetch_openrouter_usage(connector)
    when "anthropic"
      fetch_anthropic_usage(connector)
    when "openai"
      fetch_openai_usage(connector)
    else
      nil
    end
  rescue StandardError => e
    Rails.logger.warn("[AiUsageSyncJob] Failed to fetch usage from #{provider}: #{e.message}")
    nil
  end

  def fetch_openrouter_usage(connector)
    # OpenRouter provides usage in the Generation endpoint
    uri = URI("https://openrouter.ai/api/v1/generation")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Get.new(uri)
    request["Authorization"] = "Bearer #{connector.access_token}"

    response = http.request(request)
    return nil unless response.code.to_i == 200

    data = JSON.parse(response.body)
    generations = data["data"] || []

    generations.map do |gen|
      {
        external_id: gen["id"],
        model: gen["model"],
        tokens_in: gen["tokens_prompt"],
        tokens_out: gen["tokens_completion"],
        cost_usd: gen["total_cost"].to_f,
        occurred_at: Time.parse(gen["created_at"])
      }
    end
  end

  def fetch_anthropic_usage(connector)
    # Requires an Admin API key (sk-ant-admin...) stored in connector.access_token
    provider = Oauth::AnthropicProvider.new(connector)
    data = provider.fetch_usage(start_date: 7.days.ago.to_date, end_date: Date.today)
    return nil unless data

    data.map do |entry|
      cost = ModelPricingService.calculate_cost(
        tokens_in: entry[:tokens_in],
        tokens_out: entry[:tokens_out],
        model: entry[:model]
      )
      entry.merge(cost_usd: cost[:total_cost])
    end
  end

  def fetch_openai_usage(connector)
    # OpenAI usage endpoint
    uri = URI("https://api.openai.com/v1/usage")
    uri.query = URI.encode_www_form(date: Date.today.to_s)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Get.new(uri)
    request["Authorization"] = "Bearer #{connector.access_token}"

    response = http.request(request)
    return nil unless response.code.to_i == 200

    data = JSON.parse(response.body)
    # OpenAI returns aggregated usage, not individual requests
    # This would need to be adapted based on actual API response
    nil
  end

  def find_matching_event(org, provider, usage)
    org.tool_events
       .where(tool_name: "#{provider}_api")
       .where("metadata->>'external_id' = ?", usage[:external_id])
       .first
  end

  def create_event_from_usage(org, provider, usage)
    ToolEvent.create!(
      organization_id: org.id,
      tool_name: "#{provider}_api",
      event_type: "completion",
      model: usage[:model],
      tokens_in: usage[:tokens_in],
      tokens_out: usage[:tokens_out],
      cost_usd: usage[:cost_usd],
      occurred_at: usage[:occurred_at],
      metadata: {
        external_id: usage[:external_id],
        reconciled: true
      }
    )
  end
end
