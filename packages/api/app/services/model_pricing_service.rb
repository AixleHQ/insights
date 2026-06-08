# frozen_string_literal: true

# Service for calculating model pricing based on token usage
# Prices are per million tokens as of January 2026
class ModelPricingService
  # Pricing in USD per million tokens
  # Format: { model_pattern => { input: price, output: price } }
  MODEL_PRICING = {
    # OpenAI models
    "gpt-4o" => { input: 2.50, output: 10.00 },
    "gpt-4o-mini" => { input: 0.15, output: 0.60 },
    "gpt-4-turbo" => { input: 10.00, output: 30.00 },
    "gpt-4" => { input: 30.00, output: 60.00 },
    "gpt-3.5-turbo" => { input: 0.50, output: 1.50 },
    "o1" => { input: 15.00, output: 60.00 },
    "o1-mini" => { input: 3.00, output: 12.00 },
    "o3-mini" => { input: 1.10, output: 4.40 },

    # Anthropic models
    "claude-3-5-sonnet" => { input: 3.00, output: 15.00 },
    "claude-3-5-haiku" => { input: 0.80, output: 4.00 },
    "claude-3-opus" => { input: 15.00, output: 75.00 },
    "claude-3-sonnet" => { input: 3.00, output: 15.00 },
    "claude-3-haiku" => { input: 0.25, output: 1.25 },
    "claude-opus-4" => { input: 15.00, output: 75.00 },
    "claude-sonnet-4" => { input: 3.00, output: 15.00 },

    # Google models
    "gemini-2.5-pro"   => { input: 1.25, output: 10.00 },
    "gemini-2.5-flash" => { input: 0.15, output: 0.60 },
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

      # Check per-org overrides before falling back to hardcoded rates
      override = pricing_override_for_model(normalized, organization: organization)

      return { input: override.input_per_mtok.to_f, output: override.output_per_mtok.to_f } if override.present?

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

    def calculate_cost(tokens_in:, tokens_out:, model: nil, tool: nil, organization: nil)
      pricing = if model.present?
                  pricing_for_model(model, organization: organization)
      elsif tool.present?
                  pricing_for_tool(tool)
      else
                  MODEL_PRICING["default"]
      end

      input_cost = (tokens_in.to_f / 1_000_000) * pricing[:input]
      output_cost = (tokens_out.to_f / 1_000_000) * pricing[:output]

      {
        input_cost: input_cost.round(6),
        output_cost: output_cost.round(6),
        total_cost: (input_cost + output_cost).round(6),
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
