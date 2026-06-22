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

    # Bounds a catastrophically backtracking ENV override running against
    # client-controlled strings on the ingest hot path (AIX-261 review).
    REGEXP_TIMEOUT = 0.1

    # @return [String, nil] the first ticket match, uppercased, or nil
    def self.extract(metadata)
      return nil unless metadata.is_a?(Hash)
      return nil if metadata.empty?

      regexp = pattern

      SCAN_KEYS.each do |key|
        value = metadata[key] || metadata[key.to_sym]
        next unless value.is_a?(String)

        match = first_match(value, regexp)
        return match.upcase if match
      end

      nil
    end

    # Validates a client-supplied ticket value: a full match against the
    # active pattern returns the uppercased key, anything else returns nil
    # (AIX-261 review — unvalidated values must not reach the serializer).
    def self.normalize(value)
      return nil unless value.is_a?(String)

      candidate = value.strip
      match = first_match(candidate, pattern)
      return nil unless match == candidate

      match.upcase
    end

    # Resolved per call: cheap, and ENV overrides stay testable without
    # stale memoization. An invalid override must never break ingest.
    def self.pattern
      override = ENV.fetch("JIRA_TICKET_PATTERN", nil)
      return DEFAULT_PATTERN if override.blank?

      Regexp.new(override, Regexp::IGNORECASE, timeout: REGEXP_TIMEOUT)
    rescue RegexpError
      DEFAULT_PATTERN
    end

    def self.first_match(value, regexp)
      value[regexp]
    rescue Regexp::TimeoutError
      nil
    end

    private_class_method :pattern, :first_match
  end
end
