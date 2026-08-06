require 'rails_helper'

require_relative '../../../../../temporal/activities/get_policy_activity'

RSpec.describe Activities::GetPolicyActivity, type: :unit do
  let(:secrets_patterns) do
    Activities::GetPolicyActivity::DEFAULT_POLICY["rules"]["secrets"]["patterns"]
  end
  let(:openai_regex) { Regexp.new(secrets_patterns["openai_key"], Regexp::IGNORECASE) }
  let(:anthropic_regex) { Regexp.new(secrets_patterns["anthropic_key"], Regexp::IGNORECASE) }

  describe "DEFAULT_POLICY secrets.openai_key pattern" do
    it "does not match an Anthropic key (no double-detection across providers)" do
      anthropic_key = "sk-ant-api03-#{'a' * 40}"

      expect(anthropic_key).to match(anthropic_regex)
      expect(anthropic_key).not_to match(openai_regex)
    end

    it "matches a real OpenAI key" do
      openai_key = "sk-#{'a' * 30}"

      expect(openai_key).to match(openai_regex)
    end

    it "matches a real OpenAI project key" do
      openai_proj_key = "sk-proj-#{'a' * 30}"

      expect(openai_proj_key).to match(openai_regex)
    end

    it "does not match an unrelated 'sk-' substring inside a longer token" do
      prose = "please check disk-#{'a' * 30} for available space"

      expect(prose).not_to match(openai_regex)
    end
  end

  # The generic api_key catch-all (\b[A-Za-z0-9_-]{32,}\b) was retired (AIX-579):
  # it overlapped with the anchored provider patterns and over-redacted UUIDs/git SHAs.
  # Detection now relies solely on the anchored patterns above, each with a low enough
  # floor to catch realistic short tokens (see claude_chat_sanitization_spec.rb AC 3-5).
  it "does not contain the retired generic api_key catch-all" do
    expect(secrets_patterns).not_to have_key("api_key")
  end
end
