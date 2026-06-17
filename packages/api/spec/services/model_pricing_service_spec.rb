# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ModelPricingService do
  describe '.pricing_for_model' do
    context 'without organization' do
      it 'returns default pricing for blank model name' do
        expect(described_class.pricing_for_model(nil)).to eq(ModelPricingService::MODEL_PRICING["default"])
        expect(described_class.pricing_for_model("")).to eq(ModelPricingService::MODEL_PRICING["default"])
      end

      it 'returns pricing for exact model match' do
        result = described_class.pricing_for_model("gpt-4o")
        expect(result).to eq({ input: 2.50, output: 10.00 })
      end

      it 'is case-insensitive for model name' do
        expect(described_class.pricing_for_model("GPT-4O")).to eq({ input: 2.50, output: 10.00 })
      end

      it 'returns pricing via substring match for versioned names' do
        result = described_class.pricing_for_model("claude-3-5-sonnet-20241022")
        expect(result).to eq(ModelPricingService::MODEL_PRICING["claude-3-5-sonnet"])
      end

      it 'returns default pricing for completely unknown model' do
        result = described_class.pricing_for_model("unknown-model-xyz")
        expect(result).to eq(ModelPricingService::MODEL_PRICING["default"])
      end

      {
        "gemini-2.5-pro"   => { input: 1.25, output: 10.00 },
        "gemini-2.5-flash" => { input: 0.30, output: 2.50 },
        "gemini-2.0-flash" => { input: 0.10, output: 0.40 },
        "gemini-1.5-pro"   => { input: 1.25, output: 5.00 },
        "gemini-1.5-flash" => { input: 0.075, output: 0.30 },
        "gemini-1.0-pro"   => { input: 0.50, output: 1.50 }
      }.each do |model, expected|
        it "returns correct pricing for #{model}" do
          expect(described_class.pricing_for_model(model)).to eq(expected)
        end
      end

      it 'resolves versioned Gemini model names via substring match' do
        result = described_class.pricing_for_model("gemini-2.5-pro-exp-03-25")
        expect(result).to eq({ input: 1.25, output: 10.00 })
      end

      context 'dated Claude model IDs (AIX-349)' do
        it 'matches claude-opus-4-7-20260101 at $5/$25 (not $15/$75)' do
          result = described_class.pricing_for_model("claude-opus-4-7-20260101")
          expect(result).to eq({ input: 5.00, output: 25.00 })
        end

        it 'matches claude-opus-4-6-20260315 at $5/$25' do
          result = described_class.pricing_for_model("claude-opus-4-6-20260315")
          expect(result).to eq({ input: 5.00, output: 25.00 })
        end

        it 'matches claude-opus-4-5-20250901 at $5/$25' do
          result = described_class.pricing_for_model("claude-opus-4-5-20250901")
          expect(result).to eq({ input: 5.00, output: 25.00 })
        end

        it 'matches claude-opus-4-1-20250601 at $15/$75 (distinct from opus-4-5 $5/$25)' do
          result = described_class.pricing_for_model("claude-opus-4-1-20250601")
          expect(result).to eq({ input: 15.00, output: 75.00 })
          expect(result).not_to eq(described_class.pricing_for_model("claude-opus-4-5"))
        end

        it 'matches claude-sonnet-4-6-20260201 at $3/$15' do
          result = described_class.pricing_for_model("claude-sonnet-4-6-20260201")
          expect(result).to eq({ input: 3.00, output: 15.00 })
        end
      end

      context 'OpenAI substring-match ordering (AIX-349)' do
        it 'matches o1-mini at $1.10/$4.40 (not o1 $15/$60)' do
          result = described_class.pricing_for_model("o1-mini")
          expect(result).to eq({ input: 1.10, output: 4.40 })
        end

        it 'matches gpt-4o-mini at $0.15/$0.60 (not gpt-4o $2.50/$10)' do
          result = described_class.pricing_for_model("gpt-4o-mini-2024-07-18")
          expect(result).to eq({ input: 0.15, output: 0.60 })
        end
      end
    end

    context 'with organization' do
      let(:organization) { create(:organization) }

      context 'when no override exists' do
        it 'falls back to hardcoded MODEL_PRICING' do
          result = described_class.pricing_for_model("gpt-4o", organization: organization)
          expect(result).to eq({ input: 2.50, output: 10.00 })
        end

        it 'falls back to default for unknown model' do
          result = described_class.pricing_for_model("unknown-xyz", organization: organization)
          expect(result).to eq(ModelPricingService::MODEL_PRICING["default"])
        end
      end

      context 'when an exact override exists' do
        before do
          create(:model_pricing_override,
            organization: organization,
            model_pattern: "gpt-4o-ft-acme",
            input_per_mtok: 1.5,
            output_per_mtok: 6.0)
        end

        it 'returns override pricing for exact pattern match' do
          result = described_class.pricing_for_model("gpt-4o-ft-acme", organization: organization)
          expect(result[:input]).to eq(1.5)
          expect(result[:output]).to eq(6.0)
        end

        it 'returns override pricing when model name contains the pattern (versioned suffix)' do
          result = described_class.pricing_for_model("gpt-4o-ft-acme-20250101", organization: organization)
          expect(result[:input]).to eq(1.5)
          expect(result[:output]).to eq(6.0)
        end

        it 'does NOT match override when model name does not contain the pattern' do
          result = described_class.pricing_for_model("gpt-4o", organization: organization)
          # Falls back to hardcoded rate, not the override
          expect(result).to eq({ input: 2.50, output: 10.00 })
        end
      end

      context 'when override exists for a known model' do
        before do
          create(:model_pricing_override,
            organization: organization,
            model_pattern: "gpt-4o",
            input_per_mtok: 0.5,
            output_per_mtok: 2.0)
        end

        it 'returns override pricing instead of hardcoded rate' do
          result = described_class.pricing_for_model("gpt-4o", organization: organization)
          expect(result[:input]).to eq(0.5)
          expect(result[:output]).to eq(2.0)
        end
      end

      context 'when override belongs to a different organization' do
        let(:other_org) { create(:organization) }

        before do
          create(:model_pricing_override,
            organization: other_org,
            model_pattern: "gpt-4o-ft-acme",
            input_per_mtok: 1.5,
            output_per_mtok: 6.0)
        end

        it 'ignores the other org override and falls back to hardcoded rate' do
          result = described_class.pricing_for_model("gpt-4o-ft-acme", organization: organization)
          # No matching hardcoded key → falls through to "gpt-4o" substring match
          expect(result).to eq({ input: 2.50, output: 10.00 })
        end
      end

      context 'when organization is nil' do
        it 'skips override lookup and returns hardcoded pricing' do
          create(:model_pricing_override,
            organization: create(:organization),
            model_pattern: "gpt-4o",
            input_per_mtok: 0.1,
            output_per_mtok: 0.2)

          result = described_class.pricing_for_model("gpt-4o", organization: nil)
          expect(result).to eq({ input: 2.50, output: 10.00 })
        end
      end
    end
  end

  # ── pricing_override_for_model ───────────────────────────────────────────────

  describe '.pricing_override_for_model' do
    let(:organization) { create(:organization) }

    it 'returns nil when organization is nil' do
      expect(described_class.pricing_override_for_model("gpt-4o", organization: nil)).to be_nil
    end

    it 'returns nil when no override matches' do
      result = described_class.pricing_override_for_model("gpt-4o", organization: organization)
      expect(result).to be_nil
    end

    it 'returns the matching override record' do
      override = create(:model_pricing_override,
        organization: organization,
        model_pattern: "gpt-4o-ft-acme")

      result = described_class.pricing_override_for_model("gpt-4o-ft-acme", organization: organization)
      expect(result).to eq(override)
    end

    it 'matches when model name contains the pattern (substring semantics)' do
      override = create(:model_pricing_override,
        organization: organization,
        model_pattern: "gpt-4o-ft-acme")

      result = described_class.pricing_override_for_model("gpt-4o-ft-acme-20251231", organization: organization)
      expect(result).to eq(override)
    end

    it 'returns nil when pattern does not appear in model name' do
      create(:model_pricing_override,
        organization: organization,
        model_pattern: "gpt-4o-ft-acme")

      result = described_class.pricing_override_for_model("claude-3-5-sonnet", organization: organization)
      expect(result).to be_nil
    end
  end

  # ── calculate_cost (with organization:) ─────────────────────────────────────────

  describe '.calculate_cost' do
    let(:organization) { create(:organization) }

    context 'without an override' do
      it 'uses hardcoded model pricing' do
        result = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 1_000_000,
          model: "gpt-4o",
          organization: organization
        )
        expect(result[:input_cost]).to eq(2.50)
        expect(result[:output_cost]).to eq(10.00)
        expect(result[:total_cost]).to eq(12.50)
      end
    end

    context 'with an active override' do
      before do
        create(:model_pricing_override,
          organization: organization,
          model_pattern: "gpt-4o-ft-acme",
          input_per_mtok: 1.0,
          output_per_mtok: 4.0)
      end

      it 'applies override pricing to cost calculation' do
        result = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 1_000_000,
          model: "gpt-4o-ft-acme",
          organization: organization
        )
        expect(result[:input_cost]).to eq(1.0)
        expect(result[:output_cost]).to eq(4.0)
        expect(result[:total_cost]).to eq(5.0)
      end

      it 'does not apply override when organization is nil' do
        result = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 1_000_000,
          model: "gpt-4o-ft-acme",
          organization: nil
        )
        # Matches "gpt-4o" via substring → hardcoded rate
        expect(result[:input_cost]).to eq(2.50)
        expect(result[:output_cost]).to eq(10.00)
      end
    end

    context 'without model or tool' do
      it 'uses default pricing' do
        result = described_class.calculate_cost(tokens_in: 1_000_000, tokens_out: 1_000_000)
        expect(result[:input_cost]).to eq(1.00)
        expect(result[:output_cost]).to eq(3.00)
      end
    end

    context "when model is 'unknown' (unresolved client sentinel)" do
      it 'falls back to tool pricing when tool is present' do
        result = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 1_000_000,
          model: "unknown",
          tool: "cursor"
        )
        # Cursor tool pricing: $2.00/$8.00 — not generic default $1.00/$3.00
        expect(result[:input_cost]).to eq(2.00)
        expect(result[:output_cost]).to eq(8.00)
      end

      it 'falls back to default pricing when tool is also absent' do
        result = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 1_000_000,
          model: "unknown"
        )
        expect(result[:input_cost]).to eq(1.00)
        expect(result[:output_cost]).to eq(3.00)
      end
    end

    context 'with cache token breakdown (AIX-350)' do
      it 'applies cache_read rate instead of full input rate' do
        # claude-sonnet-4: input $3/M, cache_read $0.30/M, cache_write $3.75/M
        result = described_class.calculate_cost(
          tokens_in: 100_000,
          tokens_out: 200_000,
          cache_read_tokens: 900_000,
          cache_write_tokens: 0,
          model: "claude-sonnet-4"
        )
        # input: 0.1M * $3.00 = $0.30
        # output: 0.2M * $15.00 = $3.00
        # cache_read: 0.9M * $0.30 = $0.27
        expect(result[:total_cost]).to eq(3.57)
      end

      it 'applies cache_write rate separately' do
        result = described_class.calculate_cost(
          tokens_in: 500_000,
          tokens_out: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 200_000,
          model: "claude-sonnet-4"
        )
        # input: 0.5M * $3.00 = $1.50
        # cache_write: 0.2M * $3.75 = $0.75
        expect(result[:total_cost]).to eq(2.25)
      end

      it 'falls back to full input rate when cache tokens are zero' do
        result_with_cache = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 500_000,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          model: "claude-sonnet-4"
        )
        result_without_cache = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 500_000,
          model: "claude-sonnet-4"
        )
        expect(result_with_cache[:total_cost]).to eq(result_without_cache[:total_cost])
      end

      it 'demonstrates cost overestimate when cache tokens priced at input rate' do
        # Without cache breakdown: all 1M tokens at $3/M input = $3.00
        naive = described_class.calculate_cost(
          tokens_in: 1_000_000,
          tokens_out: 0,
          model: "claude-sonnet-4"
        )
        # With cache breakdown: 100K base at $3/M + 900K cache_read at $0.30/M
        accurate = described_class.calculate_cost(
          tokens_in: 100_000,
          tokens_out: 0,
          cache_read_tokens: 900_000,
          cache_write_tokens: 0,
          model: "claude-sonnet-4"
        )
        # Naive overestimates by ~5.3x on the input portion
        expect(naive[:total_cost]).to eq(3.0)
        expect(accurate[:total_cost]).to eq(0.57)
      end
    end
  end
end
