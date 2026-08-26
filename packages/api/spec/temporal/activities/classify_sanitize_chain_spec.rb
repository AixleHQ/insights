require 'rails_helper'

require_relative '../../../../../temporal/activities/classification_activity'
require_relative '../../../../../temporal/activities/sanitization_activity'
require_relative '../../../../../temporal/activities/get_policy_activity'

# AIX-541 — the classifier and sanitizer must agree on which keys are
# structural. claude_chat_sanitization_spec.rb and cursor_commit_sanitization_spec.rb
# already cover classify -> sanitize end-to-end with secrets living in content
# fields; this spec covers the one angle those don't: a secret-shaped value
# living ONLY in a structural id field.
RSpec.describe 'Classify -> Sanitize chain (AIX-541 structural-key consistency)', type: :unit do
  let(:activity_context) { instance_double(Temporalio::Activity::Context, heartbeat: nil) }
  before { allow(Temporalio::Activity::Context).to receive(:current).and_return(activity_context) }

  let(:policy) { Activities::GetPolicyActivity::DEFAULT_POLICY }
  let(:classifier) { Activities::ClassificationActivity.new }
  let(:sanitizer)  { Activities::SanitizationActivity.new }

  it "does not flag sanitization when a secret-shaped value lives only in an exempt id field" do
    # ghp_-shaped token placed ONLY in project_id (a structural key) — the classifier
    # must skip it during scanning, so requires_sanitization stays false.
    only_id = { "project_id" => "ghp_#{'b' * 36}", "metadata" => { "prompt_text" => "hello world" } }
    raw = JSON.generate(only_id)

    classification = classifier.execute("raw_payload" => raw, "policy" => policy)
    expect(classification["requires_sanitization"]).to be(false)

    # And even if sanitization were invoked anyway, the id value is preserved.
    result = sanitizer.execute("raw_payload" => raw, "policy" => policy,
                               "classification" => { "requires_sanitization" => true })
    parsed = JSON.parse(result["sanitized_payload"])
    expect(parsed["project_id"]).to eq("ghp_#{'b' * 36}")
  end
end
