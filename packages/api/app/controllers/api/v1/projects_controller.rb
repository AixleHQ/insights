# frozen_string_literal: true

module Api
  module V1
    class ProjectsController < BaseController
      before_action :set_project, only: %i[show update destroy settings update_setting destroy_setting]

      # GET /api/v1/projects
      # GET /api/v1/organizations/:organization_id/projects
      def index
        projects = authorized_scope(Project.all)

        # Scope to organization if provided
        if params[:organization_id].present?
          require_organization!
          projects = projects.where(organization_id: current_organization.id)
        elsif params[:personal] == 'true'
          projects = projects.where(owner_id: current_user.id)
        end

        projects = projects.active if params[:active] == 'true'
        projects = projects.order(:name)

        render_collection(projects, ProjectSerializer)
      end

      # GET /api/v1/projects/:id
      def show
        authorize! @project
        render_resource(@project, ProjectFullSerializer)
      end

      # POST /api/v1/projects
      # POST /api/v1/organizations/:organization_id/projects
      def create
        @project = Project.new(project_params)

        # Set organization or owner based on context
        if params[:organization_id].present?
          require_organization!
          @project.organization = current_organization
        else
          @project.owner = current_user
        end

        authorize! @project

        Project.transaction do
          @project.save!
          # Add creator as project owner (for org projects)
          if @project.organization_project?
            @project.project_memberships.create!(user: current_user, role: 'owner')
          end
        end

        render_created(@project, ProjectSerializer)
      rescue ActiveRecord::RecordInvalid => e
        render json: {
          error: 'Unprocessable Entity',
          errors: format_validation_errors(e.record.errors)
        }, status: :unprocessable_entity
      end

      # PATCH /api/v1/projects/:id
      def update
        authorize! @project

        if @project.update(project_update_params)
          render_resource(@project, ProjectSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@project.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:id
      def destroy
        authorize! @project
        @project.destroy!
        render_no_content
      end

      # GET /api/v1/projects/:id/settings
      def settings
        authorize! @project, to: :settings?
        settings = @project.project_settings.order(:key)
        render json: {
          data: ProjectSettingSerializer.new(settings).serialize
        }
      end

      # PUT /api/v1/projects/:id/settings/:key
      def update_setting
        authorize! @project, to: :settings?

        setting = @project.project_settings.find_or_initialize_by(key: params[:key])
        setting.value = params[:value]

        if setting.save
          render_resource(setting, ProjectSettingSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(setting.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:id/settings/:key
      def destroy_setting
        authorize! @project, to: :settings?

        setting = @project.project_settings.find_by!(key: params[:key])
        setting.destroy!
        render_no_content
      end

      private

      def set_project
        @project = Project.find(params[:id])
      end

      def project_params
        params.permit(:name, :slug, :description, :is_active)
      end

      def project_update_params
        params.permit(:name, :slug, :description, :is_active)
      end
    end
  end
end
