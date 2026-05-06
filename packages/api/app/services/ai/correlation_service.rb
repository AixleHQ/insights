# frozen_string_literal: true

module Ai
  class CorrelationService
    class << self
      # Attempt to correlate an event to a user based on available identifiers
      def correlate(organization:, event_data:)
        # Try correlation strategies in order of confidence
        user = nil

        # 1. Direct user_id if provided
        user ||= find_by_user_id(organization, event_data[:user_id])

        # 2. Email address
        user ||= find_by_email(organization, event_data[:email])

        # 3. Tool account external ID
        user ||= find_by_tool_account(organization, event_data[:tool_name], event_data[:external_user_id])

        # 4. Git author email (for commit events)
        user ||= find_by_git_email(organization, event_data[:git_author_email])

        # 5. Machine ID to user mapping
        user ||= find_by_machine_id(organization, event_data[:machine_id])

        # 6. IP address (lowest confidence)
        user ||= find_by_ip_address(organization, event_data[:ip_address])

        {
          user: user,
          confidence: user ? confidence_level(user, event_data) : 0,
          correlation_method: user ? correlation_method(user, event_data) : nil
        }
      end

      # Batch correlate unattributed events
      def correlate_unattributed(organization:, limit: 1000, min_confidence: 0.7)
        events = ToolEvent.where(
          organization_id: organization.id,
          user_id: nil
        ).order(occurred_at: :desc).limit(limit)

        results = { correlated: 0, failed: 0 }

        events.find_each do |event|
          result = correlate(
            organization: organization,
            event_data: extract_event_data(event)
          )

          if result[:user] && result[:confidence] >= min_confidence
            event.update!(
              user_id: result[:user].id,
              metadata: event.metadata.merge(
                "correlation_method" => result[:correlation_method],
                "correlation_confidence" => result[:confidence]
              )
            )
            results[:correlated] += 1
          elsif result[:user]
            # Record the best candidate even when below threshold so the UI can
            # show why attribution failed and surface it for manual resolution.
            event.update!(
              metadata: event.metadata.merge(
                "correlation_method" => result[:correlation_method],
                "correlation_confidence" => result[:confidence]
              )
            )
            results[:failed] += 1
          else
            results[:failed] += 1
          end
        end

        results
      end

      private

      def find_by_user_id(organization, user_id)
        return nil unless user_id.present?

        organization.members.find_by(id: user_id)
      end

      def find_by_email(organization, email)
        return nil unless email.present?

        organization.members.find_by(email: email.downcase)
      end

      def find_by_tool_account(organization, tool_name, external_id)
        return nil unless tool_name.present? && external_id.present?

        account = UserToolAccount.joins(:user)
          .where(tool_name: tool_name, external_user_id: external_id)
          .where(users: { id: organization.member_ids })
          .first

        account&.user
      end

      def find_by_git_email(organization, git_email)
        return nil unless git_email.present?

        # First try direct email match
        user = organization.members.find_by(email: git_email.downcase)
        return user if user

        # Try tool accounts for git-related tools
        account = UserToolAccount
          .joins(:user)
          .where(tool_name: %w[github gitlab bitbucket])
          .where("metadata @> ?", { git_emails: [ git_email.downcase ] }.to_json)
          .where(users: { id: organization.member_ids })
          .first

        account&.user
      end

      def find_by_machine_id(organization, machine_id)
        return nil unless machine_id.present?

        # Look up previous events from this machine that have user attribution
        recent_event = ToolEvent.where(
          organization_id: organization.id
        ).where.not(user_id: nil)
          .where("metadata->>'machine_id' = ?", machine_id)
          .order(occurred_at: :desc)
          .first

        return nil unless recent_event

        organization.members.find_by(id: recent_event.user_id)
      end

      def find_by_ip_address(organization, ip_address)
        return nil unless ip_address.present?

        # Only use IP correlation within a short time window (last 24 hours)
        recent_event = ToolEvent.where(
          organization_id: organization.id
        ).where.not(user_id: nil)
          .where("metadata->>'ip_address' = ?", ip_address)
          .where("occurred_at > ?", 24.hours.ago)
          .order(occurred_at: :desc)
          .first

        return nil unless recent_event

        organization.members.find_by(id: recent_event.user_id)
      end

      def confidence_level(user, event_data)
        if event_data[:user_id].present? && user.id.to_s == event_data[:user_id].to_s
          1.0
        elsif event_data[:email].present? && user.email.downcase == event_data[:email].to_s.downcase
          0.95
        elsif event_data[:external_user_id].present?
          0.9
        elsif event_data[:git_author_email].present?
          0.85
        elsif event_data[:machine_id].present?
          0.7
        elsif event_data[:ip_address].present?
          0.5
        else
          0.0
        end
      end

      def correlation_method(user, event_data)
        if event_data[:user_id].present? && user.id.to_s == event_data[:user_id].to_s
          "direct_user_id"
        elsif event_data[:email].present? && user.email.downcase == event_data[:email].to_s.downcase
          "email"
        elsif event_data[:external_user_id].present?
          "tool_account"
        elsif event_data[:git_author_email].present?
          "git_email"
        elsif event_data[:machine_id].present?
          "machine_id"
        elsif event_data[:ip_address].present?
          "ip_address"
        end
      end

      def extract_event_data(event)
        metadata = event.metadata || {}
        {
          user_id: event.user_id,
          email: metadata["email"],
          tool_name: event.tool_name,
          external_user_id: metadata["external_user_id"],
          git_author_email: metadata["git_author_email"],
          machine_id: metadata["machine_id"],
          ip_address: metadata["ip_address"]
        }
      end
    end
  end
end
