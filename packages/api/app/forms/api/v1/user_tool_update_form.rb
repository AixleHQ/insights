# frozen_string_literal: true

class Api::V1::UserToolUpdateForm
  include ActiveModel::Model

  VALID_CONNECTION_STATES = %w[active inactive waiting_for_connection].freeze

  attr_reader :account, :update_params

  validates :connection_state, inclusion: { in: VALID_CONNECTION_STATES }, allow_nil: true

  delegate :to_model, :persisted?, :id, to: :account

  def initialize(account)
    @account = account
    @update_params = {}
    super()
  end

  def update(params)
    @update_params = params.to_h.symbolize_keys

    return false unless valid?

    account.assign_attributes(attributes_without_connection_state)
    apply_connection_state_transition!

    return true if account.save

    merge_account_errors!
    false
  end

  private

  def connection_state
    update_params[:connection_state]
  end

  def attributes_without_connection_state
    update_params.except(:connection_state)
  end

  def apply_connection_state_transition!
    return if connection_state.nil?

    case connection_state
    when "active"
      account.activate_connection if account.may_activate_connection?
    when "inactive"
      account.deactivate_connection if account.may_deactivate_connection?
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
