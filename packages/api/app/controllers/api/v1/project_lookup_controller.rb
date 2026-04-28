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
        project = accessible_projects.find_by(git_remote_url: normalized)
        if project
          render json: { data: { project_id: project.id, name: project.name } }, status: :ok
        else
          render json: { error: "Not Found" }, status: :not_found
        end
      end
    end
  end
end
