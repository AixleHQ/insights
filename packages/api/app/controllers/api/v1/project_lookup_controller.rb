# frozen_string_literal: true

module Api
  module V1
    class ProjectLookupController < ActionController::API
      before_action :authenticate_by_token!

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

      private

      def authenticate_by_token!
        auth_header = request.headers["Authorization"]
        raw = auth_header&.start_with?("Bearer ") ? auth_header.delete_prefix("Bearer ").strip : nil
        @tool_account = raw.present? ? UserToolAccount.find_by_ingest_token(raw) : nil

        unless @tool_account&.is_active? && @tool_account.organization.present?
          render json: { error: "Unauthorized" }, status: :unauthorized
        end
      end

      def accessible_projects
        user = @tool_account.user
        org  = @tool_account.organization
        Project.active
               .where(organization_id: org.id)
               .or(Project.active.where(owner_id: user.id))
      end
    end
  end
end
