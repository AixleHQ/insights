# frozen_string_literal: true

# Owner-only gate for reading captured prompt/assistant text (event_texts).
#
# The record is the parent ToolEvent — an EventText carries no organization of its
# own; the org is resolved via the event (mirrors ToolEventPolicy#record_organization).
# Post-AIX-201 there is no admin org role, so "admins and owners" collapses to
# owners only. Members are denied (the serializer omits the eventText field for them).
class EventTextPolicy < ApplicationPolicy
  def show?
    org_owner?(record_organization) || global_admin?
  end

  private

  def record_organization
    @record_organization ||= if record.is_a?(ToolEvent)
                               record.organization
    else
                               organization
    end
  end
end
