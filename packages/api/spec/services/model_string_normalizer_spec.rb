# frozen_string_literal: true

require "rails_helper"

RSpec.describe ModelStringNormalizer do
  describe ".normalize" do
    subject(:result) { described_class.normalize(value) }

    context "when value is nil" do
      let(:value) { nil }

      it { is_expected.to be_nil }
    end

    context "when value is blank" do
      let(:value) { "   " }

      it { is_expected.to be_nil }
    end

    context "with a valid model string" do
      it "preserves a simple model name" do
        expect(described_class.normalize("gpt-4o")).to eq("gpt-4o")
      end

      it "preserves a namespaced model name" do
        expect(described_class.normalize("anthropic/claude-opus-4")).to eq("anthropic/claude-opus-4")
      end

      it "preserves a model with version suffix" do
        expect(described_class.normalize("claude-haiku-4-5-20251001")).to eq("claude-haiku-4-5-20251001")
      end

      it "preserves a model with colon" do
        expect(described_class.normalize("meta-llama:llama-3.3-70b")).to eq("meta-llama:llama-3.3-70b")
      end
    end

    context "with an XSS payload" do
      let(:value) { "<script>alert(1)</script>" }

      it "returns unknown (angle brackets are rejected outright)" do
        expect(result).to eq("unknown")
      end
    end

    context "with an HTML-wrapped model name" do
      let(:value) { "<b>gpt-4o</b>" }

      it "returns unknown (angle brackets are never valid in model names)" do
        expect(result).to eq("unknown")
      end
    end

    context "with control characters" do
      let(:value) { "gpt-4o\x00\x1f" }

      it "strips control characters" do
        expect(result).to eq("gpt-4o")
      end
    end

    context "with leading/trailing whitespace" do
      let(:value) { "  gpt-4o  " }

      it "strips surrounding whitespace" do
        expect(result).to eq("gpt-4o")
      end
    end

    context "with a string exceeding MODEL_MAX_LENGTH" do
      let(:value) { "a" * (ModelStringNormalizer::MODEL_MAX_LENGTH + 50) }

      it "truncates to MODEL_MAX_LENGTH" do
        expect(result.length).to eq(ModelStringNormalizer::MODEL_MAX_LENGTH)
      end

      it "keeps the truncated value (still valid format)" do
        expect(result).to eq("a" * ModelStringNormalizer::MODEL_MAX_LENGTH)
      end
    end

    context "with a CSV formula injection prefix" do
      it "returns unknown for = prefix" do
        expect(described_class.normalize("=cmd|' /C calc'!A0")).to eq("unknown")
      end

      it "returns unknown for + prefix" do
        expect(described_class.normalize("+HYPERLINK(\"http://evil.com\",\"click\")")).to eq("unknown")
      end

      it "returns unknown for @ prefix" do
        expect(described_class.normalize("@SUM(1+1)")).to eq("unknown")
      end
    end

    context "with a model-like string that has disallowed chars" do
      it "returns unknown for a string with spaces" do
        expect(described_class.normalize("my model name")).to eq("unknown")
      end

      it "returns unknown for a string with angle brackets not in tags" do
        expect(described_class.normalize("model<v2>")).to eq("unknown")
      end
    end

    context "with the 'unknown' sentinel itself" do
      let(:value) { "unknown" }

      it "passes through unchanged" do
        expect(result).to eq("unknown")
      end
    end
  end
end
