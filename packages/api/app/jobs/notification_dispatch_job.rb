# frozen_string_literal: true

class NotificationDispatchJob
  include Sidekiq::Job

  sidekiq_options queue: "alerts", retry: 3

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

    recipient_ids = resolve_recipients(org, routes).uniq
    return if recipient_ids.empty?

    users_by_id = User.where(id: recipient_ids).includes(:personal_setting).index_by(&:id)

    users_by_id.each_value do |user|
      settings = user.personal_setting
      # nil settings means no opt-out preference — do not skip.
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
    role_routes, user_routes = routes.partition { |r| r.recipient_type == "role" }

    role_ids = if role_routes.any?
      org.organization_memberships
         .where(role: role_routes.map(&:recipient_role).uniq)
         .pluck(:user_id)
    else
      []
    end

    role_ids + user_routes.map(&:recipient_user_id)
  end
end
