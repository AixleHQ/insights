require "aasm"

module ToolStateMachine
  extend ActiveSupport::Concern

  included do
    include AASM

    aasm column: :connection_state, whiny_transitions: true do
      state :inactive, initial: true
      state :waiting_for_connection
      state :active

      event :mark_waiting_for_connection do
        transitions from: %i[inactive active waiting_for_connection], to: :waiting_for_connection
      end

      event :activate_connection do
        transitions from: %i[inactive waiting_for_connection], to: :active
      end

      event :deactivate_connection do
        transitions from: %i[active waiting_for_connection], to: :inactive
      end
    end
  end
end
