# frozen_string_literal: true

# Live connectivity check via the provider's test_connection API.
# Used by GET /connectors/health so the UI reflects revoked credentials without a manual test.
class ConnectorConnectionProbe
  def self.call(connector)
    new(connector).call
  end

  def initialize(connector)
    @connector = connector
  end

  def call
    return @connector.reload unless @connector.status == "connected"

    provider = Oauth::BaseProvider.for(@connector)
    result = provider.test_connection
    apply_result(result)
  rescue StandardError => e
    @connector.mark_error!(e.message)
    @connector.reload
  end

  private

  def apply_result(result)
    if result[:success]
      if @connector.last_error.present?
        @connector.update!(status: "connected", last_error: nil, is_active: true)
      end
    else
      @connector.mark_error!(result[:error])
    end
    @connector.reload
  end
end
