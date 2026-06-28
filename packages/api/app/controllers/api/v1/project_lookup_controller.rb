# frozen_string_literal: true

module Api
  module V1
    class ProjectLookupController < ActionController::API
      include IngestTokenAuthentication

      # GET /api/v1/projects/lookup?git_remote=<encoded_url>
      def show
        git_remote = params[:git_remote]
        if git_remote.blank?
          render json: { error: "Bad Request", message: "git_remote parameter is required" },
                 status: :bad_request
          return
        end

        normalized = Project.normalize_git_remote(git_remote)
        project = resolve_project(normalized)
        if project
          render json: { data: { project_id: project.id, name: project.name } }, status: :ok
        else
          render json: { error: "Not Found" }, status: :not_found
        end
      end

      private

      # Org projects take priority over the user's personal projects, and an
      # exact remote match takes priority over a host-agnostic path match
      # (which rescues SSH host aliases / host variants the client couldn't
      # canonicalize). Uniqueness is enforced per (org, remote) / (owner, remote),
      # so each branch yields at most one project.
      def resolve_project(normalized)
        org_id = @tool_account.organization.id
        user_id = @tool_account.user.id

        Project.active.find_by(organization_id: org_id, git_remote_url: normalized) ||
          Project.active.find_by(owner_id: user_id, git_remote_url: normalized) ||
          project_by_path(Project.active.where(organization_id: org_id), normalized) ||
          project_by_path(Project.active.where(owner_id: user_id), normalized)
      end

      # Fallback: match by path identity (owner/repo) ignoring host. Fetches all
      # projects whose remote URL ends with the path, then filters in Ruby to confirm
      # an exact path match. Safe because the scope is already bounded to a single org
      # or user, and project count per org is small.
      def project_by_path(scope, normalized)
        path = Project.git_remote_path(normalized)
        return nil if path.blank?

        scope.where("git_remote_url LIKE ?", "%/#{Project.sanitize_sql_like(path)}")
             .find { |p| Project.git_remote_path(p.git_remote_url) == path }
      end
    end
  end
end
