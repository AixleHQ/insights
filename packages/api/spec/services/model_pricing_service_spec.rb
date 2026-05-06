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
  end
end
