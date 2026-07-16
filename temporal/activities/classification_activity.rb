# frozen_string_literal: true

require 'temporalio/activity'
require 'json'

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

      # Path 1: cursor / unscannable — no prompt body, but metadata (e.g. commit_message) may
      # still carry secrets; scan metadata text only (CUR-V16).
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

      # Path 2: pre-scanned by connector (db90-claude) — use result directly.
      # requires_sanitization is always false: the connector has already processed
      # its own content and the raw text is not available server-side to sanitize.
      if metadata['scannable'] == true && metadata['risk_level']
        raw_level  = metadata['risk_level']
        risk_level = VALID_RISK_LEVELS.include?(raw_level) ? raw_level : 'low'
        categories = Array(metadata['risk_categories'])
        return {
          'detections' => categories.map do |c|
            { 'category' => c, 'pattern' => 'pre_scanned',
              'count' => 1, 'action' => 'none' }
          end,
          'risk_score' => metadata['risk_score'].to_i,
          'risk_level' => risk_level,
          'requires_sanitization' => false,
          'detection_summary' => if categories.empty?
                                   'No sensitive data detected'
                                 else
                                   "Pre-classified: #{categories.join(', ')}"
                                 end
        }
      end

      # Path 3: standard server-side scan (web events, anything without scannable flag)
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
          next if key == 'id' || key.end_with?('_id') || STRUCTURAL_KEYS.include?(key)

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
