require "temporalio/activity"
require "json"

module Activities
  class SanitizationActivity < Temporalio::Activity::Definition
    REDACTION_PLACEHOLDER = "[REDACTED]"
    MASK_CHAR = "*"

    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Sanitizing event content")

      raw_payload = params["raw_payload"]
      policy = params["policy"]
      classification = params["classification"]

      return { "sanitized_payload" => raw_payload, "changes" => [] } unless classification["requires_sanitization"]

      changes = []
      sanitized = deep_copy(raw_payload)

      policy["rules"].each do |category, config|
        next unless config["enabled"]

        config["patterns"].each do |pattern_name, pattern|
          Temporalio::Activity::Context.current.heartbeat("Sanitizing #{category}/#{pattern_name}")

          regex = Regexp.new(pattern, Regexp::IGNORECASE)
          action = config["action"]

          sanitized, pattern_changes = apply_sanitization(sanitized, regex, action, category, pattern_name)
          changes.concat(pattern_changes)
        end
      end

      {
        "sanitized_payload" => sanitized,
        "changes" => changes,
        "change_count" => changes.length,
        "original_size" => calculate_size(raw_payload),
        "sanitized_size" => calculate_size(sanitized)
      }
    end

    private

    def deep_copy(obj)
      case obj
      when Hash
        obj.transform_values { |v| deep_copy(v) }
      when Array
        obj.map { |v| deep_copy(v) }
      when String
        obj.dup
      else
        obj
      end
    end

    def apply_sanitization(data, regex, action, category, pattern_name)
      changes = []

      case data
      when Hash
        sanitized = {}
        data.each do |key, value|
          sanitized_value, value_changes = apply_sanitization(value, regex, action, category, pattern_name)
          sanitized[key] = sanitized_value
          changes.concat(value_changes.map { |c| c.merge("path" => "#{key}.#{c['path']}".sub(/\.$/, "")) })
        end
        [sanitized, changes]
      when Array
        sanitized = []
        data.each_with_index do |value, idx|
          sanitized_value, value_changes = apply_sanitization(value, regex, action, category, pattern_name)
          sanitized << sanitized_value
          changes.concat(value_changes.map { |c| c.merge("path" => "[#{idx}].#{c['path']}".sub(/\.$/, "")) })
        end
        [sanitized, changes]
      when String
        sanitize_string(data, regex, action, category, pattern_name)
      else
        [data, []]
      end
    end

    def sanitize_string(str, regex, action, category, pattern_name)
      changes = []
      original = str.dup

      sanitized = str.gsub(regex) do |match|
        changes << {
          "category" => category,
          "pattern" => pattern_name,
          "action" => action,
          "original_length" => match.length,
          "path" => ""
        }

        case action
        when "redact"
          REDACTION_PLACEHOLDER
        when "mask"
          mask_value(match)
        when "hash"
          hash_value(match)
        when "truncate"
          truncate_value(match)
        else
          REDACTION_PLACEHOLDER
        end
      end

      [sanitized, changes]
    end

    def mask_value(value)
      return MASK_CHAR * 4 if value.length <= 4

      visible_start = [value.length / 4, 2].min
      visible_end = [value.length / 4, 2].min
      masked_length = value.length - visible_start - visible_end

      value[0, visible_start] + (MASK_CHAR * masked_length) + value[-visible_end, visible_end]
    end

    def hash_value(value)
      digest = Digest::SHA256.hexdigest(value)
      "[HASH:#{digest[0, 12]}]"
    end

    def truncate_value(value)
      return value if value.length <= 4

      "#{value[0, 2]}...#{value[-2, 2]}"
    end

    def calculate_size(data)
      case data
      when String
        data.bytesize
      else
        JSON.generate(data).bytesize
      end
    rescue
      0
    end
  end
end
