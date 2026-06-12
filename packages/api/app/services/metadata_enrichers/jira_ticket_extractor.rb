# frozen_string_literal: true

module MetadataEnrichers
  # Extracts a Jira-style ticket key (e.g. "AIX-157") from event metadata
  # hints — branch names, commit messages, shell commands. First matching key
  # wins, scanning in SCAN_KEYS priority order. (AIX-261)
  #
  # Pure function: no DB access, no mutation of inputs, string/symbol-key
  # defensive (same idiom as EventTypeNormalizer / ToolEvents::Upsert).
  class JiraTicketExtractor
    SCAN_KEYS = %w[branch branch_name commit_message bash_command tool_input_summary].freeze
    DEFAULT_PATTERN = /\b[A-Z][A-Z0-9]*-\d+\b/i

    # @return [String, nil] the first ticket match, uppercased, or nil
    def self.extract(metadata)
      return nil unless metadata.is_a?(Hash)
      return nil if metadata.empty?

      regexp = pattern

      SCAN_KEYS.each do |key|
        value = metadata[key] || metadata[key.to_sym]
        next unless value.is_a?(String)

        match = value[regexp]
        return match.upcase if match
      end

      nil
    end

    # Resolved per call: cheap, and ENV overrides stay testable without
    # stale memoization. An invalid override must never break ingest.
    def self.pattern
      override = ENV.fetch("JIRA_TICKET_PATTERN", nil)
      return DEFAULT_PATTERN if override.blank?

      Regexp.new(override, Regexp::IGNORECASE)
    rescue RegexpError
      DEFAULT_PATTERN
    end

    private_class_method :pattern
  end
end
