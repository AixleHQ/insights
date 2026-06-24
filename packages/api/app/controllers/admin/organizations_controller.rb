# frozen_string_literal: true

module Admin
  class OrganizationsController < Admin::ApplicationController
    def export
      organizations = Organization.all
      respond_to do |format|
        format.csv do
          send_data generate_csv(organizations), filename: "organizations-#{Date.current}.csv"
        end
      end
    end

    def batch_delete
      ids  = Array(params[:ids])
      return redirect_to(admin_organizations_path) if ids.empty?

      orgs = Organization.where(id: ids)
      orgs.each do |org|
        AdminAuditLog.log_action(
          admin_user:      current_admin_user,
          action:          "batch_delete",
          resource:        org,
          tracked_changes: { name: org.name, slug: org.slug },
          request:         request
        )
      end
      destroyed, skipped = orgs.partition { |org| org.destroy }
      notice = "Successfully deleted #{destroyed.size} organizations."
      notice += " #{skipped.size} could not be deleted: #{skipped.map { |o| "#{o.name} (#{o.errors.full_messages.join(', ')})" }.join('; ')}." if skipped.any?
      redirect_to admin_organizations_path, notice: notice
    end

    private

    def generate_csv(organizations)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id name slug is_active member_count created_at]
        organizations.find_each do |org|
          csv << [ org.id, org.name, org.slug, org.is_active, org.members.count, org.created_at ]
        end
      end
    end
  end
end
