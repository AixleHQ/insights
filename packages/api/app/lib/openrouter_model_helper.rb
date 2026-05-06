# frozen_string_literal: true

# Shared helpers for normalising OpenRouter model/provider identifiers.
#
# OpenRouter model names can arrive in two forms:
#   - Routed:    "openai/gpt-4o"         → provider_slug="openai",  canonical="openai/gpt-4o"
#   - Bare:      "gpt-4o" + provider_name → provider_slug derived,  canonical="openai/gpt-4o"
#
# Included by AiUsageSyncJob and OpenrouterTraceJob.
module OpenrouterModelHelper
  # Returns a normalised lowercase provider slug derived from either the
  # model string (if it contains "/") or the raw provider_name string.
  def openrouter_provider_slug(provider_name, model)
    return model.split("/").first.downcase if model.to_s.include?("/")
    return if provider_name.blank?

    provider_name.to_s.downcase.strip.gsub(/[^a-z0-9]+/, "_").gsub(/\A_|_\z/, "")
  end

  # Returns the canonical "provider/model" form. If the model already contains
  # a "/" it is returned as-is. Otherwise provider_slug is prepended.
  def openrouter_canonical_model(model, provider_slug)
    return if model.blank?
    return model if model.include?("/")

    provider_slug.present? ? "#{provider_slug}/#{model}" : model
  end
end
