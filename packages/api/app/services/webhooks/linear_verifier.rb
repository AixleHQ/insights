# frozen_string_literal: true

module Webhooks
  class LinearVerifier
    SIGNATURE_HEADER = 'Linear-Signature'

    class << self
      def verify!(payload:, signature:, secret:)
        raise SignatureMissingError, 'Missing webhook signature' if signature.blank?
        raise SignatureMissingError, 'Missing webhook secret' if secret.blank?

        expected = compute_signature(payload, secret)

        unless secure_compare(signature, expected)
          raise SignatureInvalidError, 'Invalid Linear webhook signature'
        end

        true
      end

      def compute_signature(payload, secret)
        OpenSSL::HMAC.hexdigest('SHA256', secret, payload)
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
