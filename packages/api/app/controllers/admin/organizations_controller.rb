# frozen_string_literal: true

module Admin
  class OrganizationsController < Admin::ApplicationController
    def destroy
      if requested_resource.destroy
        flash[:notice] = translate_with_resource("destroy.success")
      else
        # Every dependent: :restrict_with_error association on Organization (tool_events,
        # audit_logs, retention_purge_logs) represents retained history the org can't shed —
        # show one actionable reason instead of Rails' per-association default text.
        flash[:error] = translate_with_resource("destroy.blocked")
      end
      redirect_to after_resource_destroyed_path(requested_resource), status: :see_other
    end

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
      destroyed, skipped = orgs.partition do |org|
        success = org.destroy
        AdminAuditLog.log_action(
          admin_user:      current_admin_user,
          action:          "batch_delete",
          resource:        org,
          tracked_changes: { name: org.name, slug: org.slug },
          request:         request,
          outcome:         success ? "success" : "failure"
        )
        success
      end
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
