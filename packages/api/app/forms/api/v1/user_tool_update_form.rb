# frozen_string_literal: true

class Api::V1::UserToolUpdateForm
  include ActiveModel::Model

  VALID_CONNECTION_STATES = %w[active inactive waiting_for_connection].freeze

  # Whitelist of attributes the form is allowed to write through to UserToolAccount.
  # Adding a new field here is the explicit step required to expose it via the API.
  PERMITTED_ATTRIBUTES = %i[
    access_token
    refresh_token
    token_expires_at
    external_user_id
    external_username
    connection_state
  ].freeze

  attr_reader :account, :update_params

  validates :connection_state, inclusion: { in: VALID_CONNECTION_STATES }, allow_nil: true

  delegate :to_model, :persisted?, :id, to: :account

  def initialize(account)
    @account = account
    @update_params = {}
    super()
  end

  # @param params [ActionController::Parameters, Hash] caller is expected to have
  #   already permitted these via `params.permit(...)`. We re-permit defensively so
  #   any future caller that forgets — or passes a raw Hash — still cannot mass-assign
  #   attributes outside PERMITTED_ATTRIBUTES.
  def update(params)
    @update_params = normalize_params(params)

    return false unless valid?

    account.assign_attributes(attributes_without_connection_state)
    apply_connection_state_transition!
    return false if errors.any?

    return true if account.save

    merge_account_errors!
    false
  end

  private

  def normalize_params(params)
    permitted =
      case params
      when ActionController::Parameters
        params.permit(*PERMITTED_ATTRIBUTES).to_h
      when Hash
        # Whitelist string and symbol keys so passing { "access_token" => "..." } works.
        params.symbolize_keys.slice(*PERMITTED_ATTRIBUTES)
      else
        raise ArgumentError, "expected ActionController::Parameters or Hash, got #{params.class}"
      end

    permitted.symbolize_keys
  end

  def connection_state
    update_params[:connection_state]
  end

  def attributes_without_connection_state
    update_params.except(:connection_state)
  end

  def apply_connection_state_transition!
    return if connection_state.nil?
    return if account.connection_state == connection_state

    case connection_state
    when "active"
      if account.may_activate_connection?
        account.activate_connection
      else
        errors.add(:connection_state, "cannot transition from #{account.connection_state} to active")
      end
    when "inactive"
      if account.may_deactivate_connection?
        account.deactivate_connection
      else
        errors.add(:connection_state, "cannot transition from #{account.connection_state} to inactive")
      end
    when "waiting_for_connection"
      account.mark_waiting_for_connection if account.may_mark_waiting_for_connection?
    end
  end

  def merge_account_errors!
    account.errors.each do |error|
      errors.add(error.attribute, error.message)
    end
  end
end
