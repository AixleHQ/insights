# frozen_string_literal: true

require "rails_helper"

RSpec.describe EventTypeNormalizer do
  describe ".derive" do
    def derive(event_type: "chat", metadata: {})
      described_class.derive(event_type: event_type, metadata: metadata)
    end

    context "with the recent_commit source rule" do
      it "re-tags chat as commit when metadata.source is 'recent_commit'" do
        expect(derive(metadata: { "source" => "recent_commit" })).to eq("commit")
      end

      it "supports symbol metadata keys" do
        expect(derive(metadata: { source: "recent_commit" })).to eq("commit")
      end

      it "does not match other source values" do
        expect(derive(metadata: { "source" => "transcript" })).to be_nil
      end
    end

    context "with the git commit bash_command rule" do
      it "re-tags 'git commit -m ...' as commit" do
        expect(derive(metadata: { "bash_command" => "git commit -m 'fix'" })).to eq("commit")
      end

      it "tolerates leading whitespace" do
        expect(derive(metadata: { "bash_command" => "  git commit --amend" })).to eq("commit")
      end

      it "supports symbol metadata keys" do
        expect(derive(metadata: { bash_command: "git commit" })).to eq("commit")
      end

      it "does NOT match 'git commitish' (word boundary)" do
        expect(derive(metadata: { "bash_command" => "git commitish" })).to be_nil
      end

      it "does NOT match a command merely mentioning git commit mid-string" do
        expect(derive(metadata: { "bash_command" => "echo git commit" })).to be_nil
      end
    end

    context "with the test runner bash_command rule" do
      %w[rspec jest vitest pytest mocha].each do |runner|
        it "re-tags '#{runner} ...' as test" do
          expect(derive(metadata: { "bash_command" => "#{runner} spec/foo" })).to eq("test")
        end
      end

      it "re-tags 'go test ./...' as test" do
        expect(derive(metadata: { "bash_command" => "go test ./..." })).to eq("test")
      end

      it "matches a runner invoked mid-command (e.g. bundle exec rspec)" do
        expect(derive(metadata: { "bash_command" => "bundle exec rspec spec/" })).to eq("test")
      end

      it "does NOT match 'mochaccino' (word boundary)" do
        expect(derive(metadata: { "bash_command" => "brew install mochaccino" })).to be_nil
      end

      it "prefers the git commit rule when both could apply" do
        expect(derive(metadata: { "bash_command" => "git commit -m 'rspec green'" })).to eq("commit")
      end
    end

    context "with the edit tool_name rule" do
      %w[Edit Write MultiEdit NotebookEdit].each do |tool|
        it "re-tags tool_name '#{tool}' as edit" do
          expect(derive(metadata: { "tool_name" => tool })).to eq("edit")
        end
      end

      it "supports symbol metadata keys" do
        expect(derive(metadata: { tool_name: "Edit" })).to eq("edit")
      end

      it "does NOT match unrelated tools" do
        expect(derive(metadata: { "tool_name" => "Bash" })).to be_nil
      end

      it "is case-sensitive (lowercase 'edit' is not a Claude tool)" do
        expect(derive(metadata: { "tool_name" => "edit" })).to be_nil
      end
    end

    context "with non-chat event types" do
      %w[commit test edit tool_use completion other].each do |event_type|
        it "returns nil for '#{event_type}' even with matching metadata" do
          result = derive(event_type: event_type, metadata: { "source" => "recent_commit" })
          expect(result).to be_nil
        end
      end
    end

    context "with missing or empty metadata" do
      it "returns nil for nil metadata" do
        expect(derive(metadata: nil)).to be_nil
      end

      it "returns nil for empty metadata" do
        expect(derive(metadata: {})).to be_nil
      end

      it "returns nil when no rule matches" do
        expect(derive(metadata: { "session_id" => "abc" })).to be_nil
      end
    end

    context "with malformed metadata types" do
      it "returns nil for a String metadata payload" do
        expect(derive(metadata: "source=recent_commit")).to be_nil
      end

      it "returns nil for an Array metadata payload" do
        expect(derive(metadata: [ { "source" => "recent_commit" } ])).to be_nil
      end

      it "does not regex-match a non-String bash_command via its inspect form" do
        expect(derive(metadata: { "bash_command" => { "cmd" => "bundle exec rspec" } })).to be_nil
      end
    end

    it "does not mutate the metadata input" do
      metadata = { "source" => "recent_commit" }.freeze
      expect { derive(metadata: metadata) }.not_to raise_error
      expect(metadata).to eq("source" => "recent_commit")
    end
  end
end
