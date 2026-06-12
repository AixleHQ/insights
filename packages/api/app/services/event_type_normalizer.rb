# frozen_string_literal: true

# Derives a finer event_type for generic "chat" events from metadata hints.
#
# Defensive net for pre-T-02 CLIs and Cursor connectors without T-01: older
# clients tag everything as "chat" but already send metadata (source,
# bash_command, tool_name) that reveals the real activity. First matching
# rule wins; returns nil when no re-tag applies. (AIX-260)
#
# Pure function: no DB access, no Rails config reads (the feature-flag check
# lives in the caller, ToolEvents::Upsert), no mutation of inputs.
class EventTypeNormalizer
  EDIT_TOOLS = %w[Edit Write MultiEdit NotebookEdit].freeze
  GIT_COMMIT_PATTERN = /\A\s*git\s+commit\b/
  TEST_RUNNER_PATTERN = /(rspec|jest|vitest|pytest|go\s+test|mocha)\b/

  # @return [String, nil] the derived event_type, or nil when no rule matches
  def self.derive(event_type:, metadata:)
    return nil unless event_type.to_s == "chat"
    return nil unless metadata.is_a?(Hash)
    return nil if metadata.empty?

    return "commit" if fetch(metadata, "source") == "recent_commit"

    # Only match real command strings — a non-String bash_command (e.g. a
    # nested hash) must not be regex-matched via its inspect form.
    bash_command = fetch(metadata, "bash_command")
    if bash_command.is_a?(String)
      return "commit" if bash_command.match?(GIT_COMMIT_PATTERN)
      return "test"   if bash_command.match?(TEST_RUNNER_PATTERN)
    end

    return "edit" if EDIT_TOOLS.include?(fetch(metadata, "tool_name"))

    nil
  end

  # Metadata arrives string-keyed from the internal API / fallback paths, but
  # be defensive about symbol keys (same idiom as ToolEvents::Upsert).
  def self.fetch(metadata, key)
    metadata[key] || metadata[key.to_sym]
  end

  private_class_method :fetch
end
