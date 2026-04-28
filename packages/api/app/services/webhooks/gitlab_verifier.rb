# frozen_string_literal: true

module Webhooks
  class GitlabVerifier
    SIGNATURE_HEADER = "X-Gitlab-Token"

    class << self
      def verify!(payload:, signature:, secret:)
        raise SignatureMissingError, "Missing webhook signature" if signature.blank?
        raise SignatureMissingError, "Missing webhook secret" if secret.blank?

        # GitLab uses a simple secret token comparison (not HMAC)
        unless secure_compare(signature, secret)
          raise SignatureInvalidError, "Invalid GitLab webhook signature"
        end

        true
      end

      def extract_signature(request)
        request.headers[SIGNATURE_HEADER]
      end

      private

      def secure_compare(a, b)
        return false if a.nil? || b.nil?

        ActiveSupport::SecurityUtils.secure_compare(a, b)
      end
    end
  end
end
