# frozen_string_literal: true

require 'temporalio/activity'
require 'json'
require_relative 'sanitization_activity'

module Activities
  class ClassificationActivity < Temporalio::Activity::Definition
    VALID_RISK_LEVELS = %w[low medium high critical none].freeze

    STRUCTURAL_KEYS = %w[
      id model
      commit_hash commit_sha git_sha
    ].freeze

    def execute(params)
      Temporalio::Activity::Context.current.heartbeat('Classifying event content')

      raw_payload = params['raw_payload']
      policy      = params['policy']

      metadata = extract_metadata(raw_payload)

      if metadata['scannable'] == false
        metadata_content = extract_text_from_hash(metadata).byteslice(0, 100_000) || ''
        scan_result = scan_content(metadata_content, policy)
        return scan_result if scan_result['detections'].any?

        return {
          'detections' => [],
          'risk_score' => 0,
          'risk_level' => 'none',
          'requires_sanitization' => false,
          'detection_summary' => 'No sensitive data detected in metadata'
        }
      end

      # Path 2: pre-scanned by the connector (@aixle/insights) — use result directly.
      # requires_sanitization is always false: the connector has already processed
      # its own content and the raw text is not available server-side to sanitize.
      if metadata["scannable"] == true && metadata["risk_level"]
        raw_level  = metadata["risk_level"]
        risk_level = VALID_RISK_LEVELS.include?(raw_level) ? raw_level : "low"
        categories = Array(metadata["risk_categories"])
        result = {
          "detections"            => categories.map { |c|
                                       { "category" => c, "pattern" => "pre_scanned",
                                         "count" => 1, "action" => "none" } },
          "risk_score"            => metadata["risk_score"].to_i,
          "risk_level"            => risk_level,
          "requires_sanitization" => false,
          "detection_summary"     => categories.empty? ? "No sensitive data detected" :
                                       "Pre-classified: #{categories.join(', ')}"
        }

        prompt_text    = metadata["prompt_text"].to_s
        assistant_text = metadata["assistant_text"].to_s
        text_to_scan   = [prompt_text, assistant_text].reject(&:empty?).join("\n")

        if text_to_scan.length > 0
          Temporalio::Activity::Context.current.heartbeat("Scanning prompt/assistant text")
          text_scan = scan_content(text_to_scan.byteslice(0, 100_000), policy)
          if text_scan["detections"].any?
            result["requires_sanitization"] = true
            result["detections"]            = result["detections"] + text_scan["detections"]
            result["risk_score"]            = [result["risk_score"], text_scan["risk_score"]].max
            result["risk_level"] = higher_risk_level(result["risk_level"], text_scan["risk_level"])
            result["detection_summary"]     = summarize_detections(result["detections"])
          end
        end

        return result
      end

      content = extract_text_content(raw_payload).byteslice(0, 100_000) || ''
      scan_content(content, policy)
    end

    private

    def scan_content(content, policy)
      detections = []
      risk_score = 0
      rules = policy['rules'] || {}
      thresholds = policy['risk_thresholds'] || {
        'medium' => 1, 'high' => 3, 'critical' => 5
      }

      rules.each do |category, config|
        next unless config['enabled']

        Temporalio::Activity::Context.current.heartbeat("Checking #{category}")

        config['patterns'].each do |pattern_name, pattern|
          regex = Regexp.new(pattern, Regexp::IGNORECASE)
          matches = content.scan(regex).uniq

          next if matches.empty?

          detections << {
            'category' => category,
            'pattern' => pattern_name,
            'count' => matches.length,
            'action' => config['action']
          }

          risk_score += category_risk_weight(category) * matches.length
        end
      end

      risk_level = calculate_risk_level(risk_score, thresholds)

      {
        'detections' => detections,
        'risk_score' => risk_score,
        'risk_level' => risk_level,
        'requires_sanitization' => detections.any?,
        'detection_summary' => summarize_detections(detections)
      }
    end

    def extract_metadata(raw_payload)
      data = raw_payload.is_a?(String) ? JSON.parse(raw_payload) : raw_payload
      data.is_a?(Hash) ? (data['metadata'] || {}) : {}
    rescue JSON::ParserError
      {}
    end

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
      return '' if depth > 10 # Prevent infinite recursion

      case data
      when Hash
        data.filter_map do |k, v|
          key = k.to_s
          next if structural_key?(key)

          extract_text_from_hash(v, depth: depth + 1)
        end.join(' ')
      when Array
        data.map { |v| extract_text_from_hash(v, depth: depth + 1) }.join(' ')
      when String
        data
      else
        data.to_s
      end
    end

    # Structural identifiers are connector-generated correlation IDs, not user-authored
    # text, so they must never be risk-scored as secrets (AIX-541). Kept in sync with
    # SanitizationActivity::NON_CONTENT_KEYS so classify and sanitize agree on what counts
    # as structural — see classify_sanitize_chain_spec.rb.
    def structural_key?(key)
      SanitizationActivity::NON_CONTENT_KEYS.include?(key) ||
        key == 'id' ||
        key.end_with?('_id') ||
        STRUCTURAL_KEYS.include?(key)
    end

    def category_risk_weight(category)
      case category
      when 'secrets'
        3
      when 'hipaa'
        2
      when 'pii'
        1
      else
        1
      end
    end

    def calculate_risk_level(score, thresholds)
      if score >= thresholds['critical']
        'critical'
      elsif score >= thresholds['high']
        'high'
      elsif score >= thresholds['medium']
        'medium'
      else
        'low'
      end
    end

    def higher_risk_level(level_a, level_b)
      order = { "none" => 0, "low" => 1, "medium" => 2, "high" => 3, "critical" => 4 }
      (order[level_a] || 0) >= (order[level_b] || 0) ? level_a : level_b
    end

    def summarize_detections(detections)
      return 'No sensitive data detected' if detections.empty?

      by_category = detections.group_by { |d| d['category'] }
      parts = by_category.map do |category, items|
        count = items.sum { |i| i['count'] }
        "#{count} #{category} detection(s)"
      end

      parts.join(', ')
    end
  end
end
