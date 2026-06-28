# frozen_string_literal: true

class UserPersonalSettingsSerializer < BaseSerializer
  attributes :id, :cost_threshold_cents, :token_threshold, :alert_email, :alert_slack
end
