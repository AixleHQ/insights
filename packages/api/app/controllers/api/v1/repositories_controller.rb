# frozen_string_literal: true

module Api
  module V1
    class RepositoriesController < BaseController
      before_action :set_project
      before_action :set_repository, only: %i[show update destroy sync]

      # GET /api/v1/projects/:project_id/repositories
      def index
        repositories = @project.repositories.includes(:organization_connector).order(:name)

        # Allow filtering
        repositories = repositories.private_repos if params[:private] == "true"
        repositories = repositories.public_repos if params[:private] == "false"

        render_collection(repositories, RepositorySerializer)
      end

      # GET /api/v1/projects/:project_id/repositories/:id
      def show
        authorize! @repository
        render_resource(@repository, RepositorySerializer)
      end

      # POST /api/v1/projects/:project_id/repositories
      def create
        @repository = @project.repositories.new(repository_params)
        authorize! @repository

        if @repository.save
          enqueue_sync(@repository)
          render_created(@repository, RepositorySerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@repository.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/projects/:project_id/repositories/:id
      def update
        authorize! @repository

        if @repository.update(repository_update_params)
          render_resource(@repository, RepositorySerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@repository.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:project_id/repositories/:id
      def destroy
        authorize! @repository
        @repository.destroy!
        render_no_content
      end

      # POST /api/v1/projects/:project_id/repositories/:id/sync
      def sync
        authorize! @repository, to: :sync?

        # Queue sync job
        # RepositorySyncJob.perform_later(@repository.id)

        @repository.mark_synced!
        render_resource(@repository, RepositorySerializer)
      end

      private

      def set_project
        @project = Project.find(params[:project_id])
      end

      def set_repository
        @repository = @project.repositories.find(params[:id])
      end

      def repository_params
        params.permit(:organization_connector_id, :external_id, :name, :full_name,
                      :url, :html_url, :clone_url, :default_branch, :is_private, :description)
      end

      def repository_update_params
        params.permit(:default_branch, :url)
      end

      def enqueue_sync(repository)
        connector = repository.organization_connector
        return unless connector

        # Runs sync_repositories which refreshes repo metadata from the provider.
        # Commit history arrives via webhooks going forward.
        ConnectorSyncService.enqueue(connector)
      end
    end
  end
end
