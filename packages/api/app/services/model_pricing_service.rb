# frozen_string_literal: true

# Service for calculating model pricing based on token usage
# Prices are per million tokens, verified 2026-06-17
class ModelPricingService
  # Pricing in USD per million tokens
  # Format: { model_pattern => { input:, output:, cache_write?:, cache_read?: } }
  # cache_write / cache_read are optional (Anthropic prompt caching); when absent,
  # cache tokens are not priced separately and fall back to 0.
  MODEL_PRICING = {
    # OpenAI models (longer/specific patterns before shorter/generic ones)
    "gpt-4o-mini" => { input: 0.15, output: 0.60 },
    "gpt-4o" => { input: 2.50, output: 10.00 },
    "gpt-4.1-mini" => { input: 0.40, output: 1.60 },
    "gpt-4.1" => { input: 2.00, output: 8.00 },
    "gpt-4-turbo" => { input: 10.00, output: 30.00 },
    "gpt-4" => { input: 30.00, output: 60.00 },
    "gpt-3.5-turbo" => { input: 0.50, output: 1.50 },
    "o4-mini" => { input: 1.10, output: 4.40 },
    "o3-mini" => { input: 1.10, output: 4.40 },
    "o3" => { input: 2.00, output: 8.00 },
    "o1-mini" => { input: 1.10, output: 4.40 },
    "o1" => { input: 15.00, output: 60.00 },

    # Anthropic models
    "claude-fable-5" => { input: 10.00, output: 50.00 },
    "claude-opus-4-8" => { input: 5.00, output: 25.00 },
    "claude-opus-4-7" => { input: 5.00, output: 25.00 },
    "claude-opus-4-6" => { input: 5.00, output: 25.00 },
    "claude-opus-4-5" => { input: 5.00, output: 25.00 },
    "claude-opus-4-1" => { input: 15.00, output: 75.00 },
    "claude-opus-4" => { input: 15.00, output: 75.00, cache_write: 18.75, cache_read: 1.50 },
    "claude-sonnet-4-6" => { input: 3.00, output: 15.00 },
    "claude-sonnet-4" => { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
    "claude-haiku-4-5" => { input: 1.00, output: 5.00 },
    "claude-3-5-sonnet" => { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
    "claude-3-5-haiku" => { input: 0.80, output: 4.00, cache_write: 1.00, cache_read: 0.08 },
    "claude-3-opus" => { input: 15.00, output: 75.00, cache_write: 18.75, cache_read: 1.50 },
    "claude-3-sonnet" => { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
    "claude-3-haiku" => { input: 0.25, output: 1.25, cache_write: 0.3125, cache_read: 0.025 },

    # Google models
    "gemini-2.5-pro"   => { input: 1.25, output: 10.00 },
    "gemini-2.5-flash" => { input: 0.30, output: 2.50 },
    "gemini-2.0-flash" => { input: 0.10, output: 0.40 },
    "gemini-1.5-pro"   => { input: 1.25, output: 5.00 },
    "gemini-1.5-flash" => { input: 0.075, output: 0.30 },
    "gemini-1.0-pro"   => { input: 0.50, output: 1.50 },

    # Default for unknown models
    "default" => { input: 1.00, output: 3.00 }
  }.freeze

  # Tool-based pricing (estimated averages when model is unknown)
  TOOL_PRICING = {
    "github_copilot" => { input: 0.50, output: 1.50 },
    "cursor" => { input: 2.00, output: 8.00 },
    "windsurf" => { input: 2.00, output: 8.00 },
    "claude_code" => { input: 3.00, output: 15.00 },
    "aider" => { input: 3.00, output: 15.00 },
    "continue" => { input: 1.00, output: 4.00 },
    "cody" => { input: 1.00, output: 4.00 },
    "tabnine" => { input: 0.50, output: 1.50 },
    "amazon_q" => { input: 1.00, output: 4.00 },
    "openrouter_api" => { input: 2.00, output: 8.00 },
    "anthropic_api" => { input: 3.00, output: 15.00 },
    "openai_api" => { input: 2.50, output: 10.00 },
    "gemini_api" => { input: 0.50, output: 2.00 },
    "custom" => { input: 1.00, output: 3.00 }
  }.freeze

  class << self
    def pricing_for_model(model_name, organization: nil)
      return MODEL_PRICING["default"] if model_name.blank?

      normalized = model_name.to_s.downcase

      # Check per-org overrides before falling back to hardcoded rates.
      # Overrides only carry input/output rates, so derive cache rates from the
      # overridden input using Anthropic's standard ratios (write 1.25x, read 0.10x)
      # — otherwise cache tokens would be billed at $0 for orgs with overrides.
      override = pricing_override_for_model(normalized, organization: organization)

      if override.present?
        input = override.input_per_mtok.to_f
        return {
          input:       input,
          output:      override.output_per_mtok.to_f,
          cache_write: (input * 1.25).round(6),
          cache_read:  (input * 0.10).round(6)
        }
      end

      # Try exact match first
      return MODEL_PRICING[normalized] if MODEL_PRICING.key?(normalized)

      # Try pattern matching
      MODEL_PRICING.each do |pattern, pricing|
        return pricing if normalized.include?(pattern)
      end

      MODEL_PRICING["default"]
    end

    def pricing_override_for_model(model_name, organization: nil)
      return nil if organization.blank?

      ModelPricingOverride
        .where(organization: organization)
        .find_by("? ILIKE '%' || model_pattern || '%'", model_name)
    end

    def pricing_for_tool(tool_name)
      TOOL_PRICING[tool_name.to_s] || TOOL_PRICING["custom"]
    end

    def calculate_cost(tokens_in:, tokens_out:, model: nil, tool: nil, organization: nil,
                       cache_read_tokens: 0, cache_write_tokens: 0)
      pricing = if model.present? && model != "unknown"
                  pricing_for_model(model, organization: organization)
      elsif tool.present?
                  pricing_for_tool(tool)
      else
                  MODEL_PRICING["default"]
      end

      input_cost = (tokens_in.to_f / 1_000_000) * pricing[:input]
      output_cost = (tokens_out.to_f / 1_000_000) * pricing[:output]

      cache_read_cost = if cache_read_tokens.to_i > 0 && pricing[:cache_read]
        (cache_read_tokens.to_f / 1_000_000) * pricing[:cache_read]
      else
        0.0
      end

      cache_write_cost = if cache_write_tokens.to_i > 0 && pricing[:cache_write]
        (cache_write_tokens.to_f / 1_000_000) * pricing[:cache_write]
      else
        0.0
      end

      total = input_cost + output_cost + cache_read_cost + cache_write_cost

      {
        input_cost: input_cost.round(6),
        output_cost: output_cost.round(6),
        cache_read_cost: cache_read_cost.round(6),
        cache_write_cost: cache_write_cost.round(6),
        total_cost: total.round(6),
        pricing: pricing
      }
    end

    def all_model_pricing
      MODEL_PRICING.except("default")
    end

    def all_tool_pricing
      TOOL_PRICING
    end
  end
end
