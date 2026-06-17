# frozen_string_literal: true

# Normalizes an ingest model string to a safe, predictable form.
#
# Rules applied in order:
#   1. nil / blank input  → nil (model column is optional; no rejection)
#   2. Strip leading/trailing whitespace
#   3. Strip HTML tags (e.g. <script>alert(1)</script> → "alert(1)")
#   4. Remove control characters (U+0000–U+001F, U+007F, U+0080–U+009F)
#   5. Truncate to MODEL_MAX_LENGTH characters
#   6. Validate format — must start with a letter/digit and contain only
#      letters, digits, hyphens, underscores, dots, slashes, or colons.
#      Anything that does not match → "unknown"
#
# The "unknown" sentinel is safe downstream: ModelPricingService falls back to
# default pricing and daily_by_model groups it under "Other". Ingest is never
# rejected solely because of an unrecognised model string.
class ModelStringNormalizer
  MODEL_MAX_LENGTH = 100

  # Allows: letters, digits, hyphens, underscores, dots, forward slashes, colons.
  # Must start with a letter or digit (prevents leading formula-injection chars).
  MODEL_FORMAT = /\A[a-zA-Z0-9][a-zA-Z0-9._:\-\/]*\z/

  UNKNOWN = "unknown"

  def self.normalize(value)
    new(value).normalize
  end

  def initialize(value)
    @value = value
  end

  def normalize
    return nil if @value.nil?

    str = @value.to_s
    return nil if str.blank?

    str = str.strip

    # Any angle bracket indicates an HTML/XML injection attempt — no legitimate
    # model name contains < or >. Return "unknown" immediately rather than
    # stripping tags and potentially storing the injected text fragment.
    return UNKNOWN if str.match?(/[<>]/)

    str = strip_control_chars(str)
    str = str.strip

    return nil if str.blank?

    str = str[0, MODEL_MAX_LENGTH]
    str.match?(MODEL_FORMAT) ? str : UNKNOWN
  end

  private

  def strip_control_chars(str)
    str.gsub(/[\x00-\x1f\x7f\u0080-\u009f]/u, "")
  end
end
