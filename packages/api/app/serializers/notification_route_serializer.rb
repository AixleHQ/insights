class NotificationRouteSerializer < BaseSerializer
  attributes :id, :organization_id, :notification_type, :recipient_type,
             :recipient_role, :recipient_user_id, :enabled
  timestamps
end
