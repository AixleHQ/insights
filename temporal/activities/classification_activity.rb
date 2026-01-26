require "temporalio/activity"
require "json"

module Activities
  class ClassificationActivity < Temporalio::Activity::Definition
    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Classifying event content")

      raw_payload = params["raw_payload"]
      policy = params["policy"]

      content = extract_text_content(raw_payload)
      detections = []
      risk_score = 0

      policy["rules"].each do |category, config|
        next unless config["enabled"]

        Temporalio::Activity::Context.current.heartbeat("Checking #{category}")

        config["patterns"].each do |pattern_name, pattern|
          regex = Regexp.new(pattern, Regexp::IGNORECASE)
          matches = content.scan(regex)

          if matches.any?
            detections << {
              "category" => category,
              "pattern" => pattern_name,
              "count" => matches.length,
              "action" => config["action"]
            }

            # Increment risk score based on category
            risk_score += category_risk_weight(category) * matches.length
          end
        end
      end

      risk_level = calculate_risk_level(risk_score, policy["risk_thresholds"])

      {
        "detections" => detections,
        "risk_score" => risk_score,
        "risk_level" => risk_level,
        "requires_sanitization" => detections.any?,
        "detection_summary" => summarize_detections(detections)
      }
    end

    private

    def extract_text_content(payload)
      if payload.is_a?(String)
        begin
          data = JSON.parse(payload)
          extract_text_from_hash(data)
        rescue JSON::ParserError
          payload
        end
      else
        extract_text_from_hash(payload)
      end
    end

    def extract_text_from_hash(data, depth: 0)
      return "" if depth > 10 # Prevent infinite recursion

      case data
      when Hash
        data.values.map { |v| extract_text_from_hash(v, depth: depth + 1) }.join(" ")
      when Array
        data.map { |v| extract_text_from_hash(v, depth: depth + 1) }.join(" ")
      when String
        data
      else
        data.to_s
      end
    end

    def category_risk_weight(category)
      case category
      when "secrets"
        3
      when "hipaa"
        2
      when "pii"
        1
      else
        1
      end
    end

    def calculate_risk_level(score, thresholds)
      if score >= thresholds["critical"]
        "critical"
      elsif score >= thresholds["high"]
        "high"
      elsif score >= thresholds["medium"]
        "medium"
      else
        "low"
      end
    end

    def summarize_detections(detections)
      return "No sensitive data detected" if detections.empty?

      by_category = detections.group_by { |d| d["category"] }
      parts = by_category.map do |category, items|
        count = items.sum { |i| i["count"] }
        "#{count} #{category} detection(s)"
      end

      parts.join(", ")
    end
  end
end
