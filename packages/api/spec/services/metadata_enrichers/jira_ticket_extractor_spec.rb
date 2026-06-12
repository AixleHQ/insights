# frozen_string_literal: true

require "rails_helper"

RSpec.describe MetadataEnrichers::JiraTicketExtractor do
  describe ".extract" do
    it "extracts a ticket from branch_name" do
      metadata = { "branch_name" => "feature/AIX-157-foo" }
      expect(described_class.extract(metadata)).to eq("AIX-157")
    end

    it "extracts a ticket from commit_message" do
      metadata = { "commit_message" => "[AIX-42] Add connector health display" }
      expect(described_class.extract(metadata)).to eq("AIX-42")
    end

    it "extracts a ticket from bash_command" do
      metadata = { "bash_command" => "git checkout feature/ABC-9-fix" }
      expect(described_class.extract(metadata)).to eq("ABC-9")
    end

    it "extracts a ticket from tool_input_summary" do
      metadata = { "tool_input_summary" => "Editing spec for PROJ2-77" }
      expect(described_class.extract(metadata)).to eq("PROJ2-77")
    end

    it "prioritizes branch over branch_name over commit_message" do
      metadata = {
        "commit_message" => "[AAA-3] msg",
        "branch_name"    => "feature/BBB-2-x",
        "branch"         => "feature/CCC-1-y"
      }
      expect(described_class.extract(metadata)).to eq("CCC-1")
    end

    it "uppercases lowercase matches" do
      metadata = { "branch_name" => "feature/aix-12-lowercase" }
      expect(described_class.extract(metadata)).to eq("AIX-12")
    end

    it "supports symbol keys" do
      metadata = { branch_name: "feature/AIX-5-sym" }
      expect(described_class.extract(metadata)).to eq("AIX-5")
    end

    it "ignores non-String values" do
      metadata = { "branch_name" => { "nested" => "AIX-9" }, "commit_message" => 42 }
      expect(described_class.extract(metadata)).to be_nil
    end

    it "returns nil when nothing matches" do
      expect(described_class.extract({ "branch_name" => "main" })).to be_nil
    end

    it "returns nil for nil metadata" do
      expect(described_class.extract(nil)).to be_nil
    end

    it "returns nil for empty metadata" do
      expect(described_class.extract({})).to be_nil
    end

    it "returns nil for non-Hash metadata" do
      expect(described_class.extract("AIX-1")).to be_nil
    end

    it "does not mutate the input metadata" do
      metadata = { "branch_name" => "feature/AIX-8-x" }
      described_class.extract(metadata)
      expect(metadata).to eq({ "branch_name" => "feature/AIX-8-x" })
    end

    context "with JIRA_TICKET_PATTERN env override" do
      around do |example|
        original = ENV["JIRA_TICKET_PATTERN"]
        example.run
      ensure
        original.nil? ? ENV.delete("JIRA_TICKET_PATTERN") : ENV["JIRA_TICKET_PATTERN"] = original
      end

      it "uses the override pattern" do
        ENV["JIRA_TICKET_PATTERN"] = 'XX-\d+'
        metadata = { "branch_name" => "feature/AIX-1-and-xx-22" }
        expect(described_class.extract(metadata)).to eq("XX-22")
      end

      it "falls back to the default pattern on invalid regex" do
        ENV["JIRA_TICKET_PATTERN"] = "[unclosed"
        metadata = { "branch_name" => "feature/AIX-3-x" }
        expect(described_class.extract(metadata)).to eq("AIX-3")
      end
    end
  end
end
