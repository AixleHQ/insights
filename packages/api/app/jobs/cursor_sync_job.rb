# frozen_string_literal: true

class CursorSyncJob < ApplicationJob
  queue_as :connectors

  def self.enqueue_all
    OrganizationConnector.active.by_type("cursor").find_each do |c|
      perform_later(c.id)
    end
  end

  def perform(connector_id)
    @sync_started_at = Time.current
    @connector = OrganizationConnector.find(connector_id)
    provider   = Oauth::CursorProvider.new(@connector)

    sync_billing(provider)
    @connector.mark_synced!(sync_started_at: @sync_started_at)

    Rails.logger.info("[CursorSyncJob] Completed for connector #{connector_id}")
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error("[CursorSyncJob] Connector #{connector_id} not found")
  rescue StandardError => e
    Rails.logger.error("[CursorSyncJob] Failed for connector #{connector_id}: #{e.message}")
    @connector&.mark_error!(e.message, sync_started_at: @sync_started_at)
    raise
  end

  private

  def sync_billing(provider)
    seats = provider.fetch_seats
    spend = provider.fetch_spend

    # A 1-off mismatch here is expected if a member is added/removed between the two
    # API calls. /teams/members active count is the source of truth for seat_count;
    # totalMembers from /teams/spend is a cross-check only.
    if spend[:total_members] && seats[:seat_count] != spend[:total_members]
      Rails.logger.warn(
        "[CursorSyncJob] Seat count mismatch for connector #{@connector.id}: " \
        "/teams/members active=#{seats[:seat_count]}, " \
        "/teams/spend totalMembers=#{spend[:total_members]}. Using /teams/members count."
      )
    end

    @connector.update!(
      config: (@connector.config || {}).merge(
        "seat_count"            => seats[:seat_count],
        "overage_spend_cents"   => spend[:overage_spend_cents],
        "overall_spend_cents"   => spend[:overall_spend_cents],
        "fast_premium_requests" => spend[:fast_premium_requests],
        "billing_cycle_start"   => spend[:billing_cycle_start]
      )
    )
  end
end
