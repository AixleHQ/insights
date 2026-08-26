# frozen_string_literal: true

# AIX-716 — redacts bearer-equivalent credentials that live in a URL *path*
# segment out of Rollbar payloads.
#
# Why a transform and not a scrub_fields entry: Rollbar's own URL scrubber
# (Rollbar::Scrubbers::URL#filter) rewrites only the userinfo user, the userinfo
# password, and the query string. It never looks at path segments, and its field
# matcher is anchored (`^field$`), so no scrub_fields value can reach a
# credential that is part of the path. `config.transform` is the only hook that
# runs late enough to rewrite payload["data"][:request][:url] before the payload
# is transmitted. Registered in config/initializers/rollbar.rb.
#
# Nothing in here may raise. Rollbar's transform loop rescues, logs, and then
# BREAKS out of the handler list (rollbar-3.7.0 lib/rollbar/item.rb:295-307), so
# an exception would leave the unredacted URL in the payload *and* skip every
# later handler — the control would fail open, silently. Every hop is guarded and
# there is a belt-and-braces rescue at the end.
module RollbarCredentialPathScrubber
  PLACEHOLDER = "[FILTERED]"

  # Each pattern captures the route prefix in group 1 and matches exactly the one
  # credential segment that follows it. Add a pattern whenever another route puts
  # a secret in the path.
  CREDENTIAL_PATH_PATTERNS = [
    # POST /api/v1/webhooks/openrouter_traces/:webhook_token
    %r{(/api/v1/webhooks/openrouter_traces/)[^/?#]+}
  ].freeze

  REPLACEMENT = "\\1#{PLACEHOLDER}"

  class << self
    # Rollbar calls this with its transform options hash and ignores the return
    # value; the payload is mutated in place.
    def call(options)
      request = request_node(options.is_a?(Hash) ? options[:payload] : nil)
      return unless request

      key = request.key?(:url) ? :url : "url"
      url = request[key]
      return unless url.is_a?(String)

      request[key] = redact(url)
      nil
    rescue StandardError => e
      # Deliberately swallowed — see the note above. The class name is safe to
      # log; the URL is not, so it is never included here.
      Rails.logger.error("[AIX-716] Rollbar credential-path scrubber failed: #{e.class}")
      nil
    end

    def redact(url)
      CREDENTIAL_PATH_PATTERNS.reduce(url) { |acc, pattern| acc.gsub(pattern, REPLACEMENT) }
    end

    private

    def request_node(payload)
      return nil unless payload.is_a?(Hash)

      data = payload["data"] || payload[:data]
      return nil unless data.is_a?(Hash)

      request = data[:request] || data["request"]
      request.is_a?(Hash) ? request : nil
    end
  end
end
