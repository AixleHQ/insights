# frozen_string_literal: true

module EventTexts
  class Persist
    MAX_TEXT_LENGTH = 8192
    SANITIZER_VERSION_DEFAULT = "v2"

    # @param tool_event_id [String] UUID of the persisted tool event
    # @param occurred_at   [String, Time] event timestamp (partition key)
    # @param user_text     [String, nil] sanitized prompt text from the user
    # @param assistant_text [String, nil] sanitized assistant response text
    # @param sanitizer_version [String, nil] policy version from GetPolicyActivity; falls back to SANITIZER_VERSION_DEFAULT
    # @return [Hash] { captured: Boolean, event_text: EventText | nil }
    def self.call(tool_event_id:, occurred_at:, user_text: nil, assistant_text: nil, sanitizer_version: nil)
      new(
        tool_event_id: tool_event_id,
        occurred_at: occurred_at,
        user_text: user_text,
        assistant_text: assistant_text,
        sanitizer_version: sanitizer_version
      ).call
    end

    def initialize(tool_event_id:, occurred_at:, user_text: nil, assistant_text: nil, sanitizer_version: nil)
      @tool_event_id = tool_event_id
      @occurred_at = occurred_at
      @user_text = truncate(user_text)
      @assistant_text = truncate(assistant_text)
      @sanitizer_version = sanitizer_version.presence || SANITIZER_VERSION_DEFAULT
    end

    def call
      return { captured: false, event_text: nil } unless prompt_capture_enabled?
      return { captured: false, event_text: nil } if @user_text.blank? && @assistant_text.blank?

      event_text = upsert_event_text
      { captured: true, event_text: event_text }
    end

    private

    def prompt_capture_enabled?
      ActiveModel::Type::Boolean.new.cast(ENV.fetch("AIXLE_INSIGHTS_PROMPT_CAPTURE", "false")) || false
    end

    def truncate(text)
      return nil if text.nil?

      text.to_s[0, MAX_TEXT_LENGTH]
    end

    def upsert_event_text
      EventText.upsert(
        {
          tool_event_id: @tool_event_id,
          occurred_at: @occurred_at,
          user_text: @user_text,
          assistant_text: @assistant_text,
          sanitized_at: Time.current,
          sanitizer_version: @sanitizer_version,
          created_at: Time.current
        },
        unique_by: %i[tool_event_id occurred_at],
        update_only: %i[user_text assistant_text sanitized_at sanitizer_version]
      )
      EventText.find_by(tool_event_id: @tool_event_id, occurred_at: @occurred_at)
    end
  end
end
