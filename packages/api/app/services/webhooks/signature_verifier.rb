# frozen_string_literal: true

module Webhooks
  class SignatureVerifier
    VERIFIER_MAP = {
      "github" => Webhooks::GithubVerifier,
      "gitlab" => Webhooks::GitlabVerifier,
      "bitbucket" => Webhooks::BitbucketVerifier,
      "jira" => Webhooks::JiraVerifier,
      "linear" => Webhooks::LinearVerifier
    }.freeze

    class << self
      def for(provider)
        verifier_class = VERIFIER_MAP[provider.to_s]
        raise ArgumentError, "Unknown webhook provider: #{provider}" unless verifier_class

        verifier_class
      end

      def verify!(provider:, payload:, signature:, secret:)
        verifier = self.for(provider)
        verifier.verify!(payload: payload, signature: signature, secret: secret)
      end

      def verify(provider:, payload:, signature:, secret:)
        verify!(provider: provider, payload: payload, signature: signature, secret: secret)
        true
      rescue SignatureInvalidError
        false
      end

      def supported_providers
        VERIFIER_MAP.keys
      end
    end
  end

  class SignatureInvalidError < StandardError; end
  class SignatureMissingError < StandardError; end
end
