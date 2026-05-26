# frozen_string_literal: true

module Admin
  class ProjectsController < Admin::ApplicationController
    def export
      projects = Project.all
      respond_to do |format|
        format.csv do
          send_data generate_csv(projects), filename: "projects-#{Date.current}.csv"
        end
      end
    end

    def batch_delete
      ids      = Array(params[:ids])
      return redirect_to(admin_projects_path) if ids.empty?

      projects = Project.where(id: ids)
      projects.each do |project|
        AdminAuditLog.log_action(
          admin_user:      current_admin_user,
          action:          "batch_delete",
          resource:        project,
          tracked_changes: { name: project.name, slug: project.slug },
          request:         request
        )
      end
      deleted = projects.destroy_all.size
      redirect_to admin_projects_path, notice: "Successfully deleted #{deleted} projects."
    end

    private

    def generate_csv(projects)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id name slug organization_id owner_id is_active created_at]
        projects.find_each do |project|
          csv << [ project.id, project.name, project.slug, project.organization_id,
                  project.owner_id, project.is_active, project.created_at ]
        end
      end
    end
  end
end
