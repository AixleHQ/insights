# frozen_string_literal: true

class NotificationDispatchJob
  include Sidekiq::Job

  sidekiq_options queue: "alerts", retry: 3

  # Resolves notification_routes for (organization_id, notification_type), deduplicates
  # recipients, checks per-user opt-out, creates Notification rows, and fires the org-level
  # Slack webhook once.
  #
  # Delivery notes:
  #   - At-least-once: on retry, duplicate Notification rows are possible (acceptable).
  #   - Per-user email / Slack DM delivery is deferred — no per-user mailer or user-linked
  #     Slack tokens exist today; the org webhook is fired once regardless of recipient count.
  #   - alert_data must be a JSON-serializable Hash (Sidekiq serializes job args as JSON).
  def perform(organization_id, notification_type, alert_data)
    org = Organization.find(organization_id)
    alert_data = alert_data.with_indifferent_access

    routes = org.notification_routes
                .where(notification_type: notification_type, enabled: true)
                .includes(:recipient_user)

    recipient_ids = resolve_recipients(org, routes).uniq
    return if recipient_ids.empty?

    recipient_ids.each do |user_id|
      user = User.find_by(id: user_id)
      next unless user

      settings = user.personal_setting
      # Skip only when the user has explicitly opted out of both channels.
      # nil settings (record not yet created) means no opt-out preference — do not skip.
      next if settings && !settings.alert_slack && !settings.alert_email

      Notification.create!(
        user: user,
        organization: org,
        notification_type: notification_type,
        payload: alert_data
      )
    end

    Slack::NotificationService.deliver_alert(org, alert_data)
  rescue ActiveRecord::RecordNotFound => e
    logger.error("[NotificationDispatchJob] #{e.message}")
  end

  private

  def resolve_recipients(org, routes)
    routes.flat_map do |route|
      if route.recipient_type == "role"
        org.organization_memberships.where(role: route.recipient_role).pluck(:user_id)
      else
        [ route.recipient_user_id ]
      end
    end
  end
end
