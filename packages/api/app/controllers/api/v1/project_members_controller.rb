# frozen_string_literal: true

module Api
  module V1
    class ProjectMembersController < BaseController
      before_action :set_project
      before_action :set_membership, only: %i[show update destroy]

      # GET /api/v1/projects/:project_id/members
      def index
        authorize! @project.project_memberships.new, to: :index?

        memberships = @project.project_memberships.includes(:user).order("users.name")

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        render_collection(memberships, ProjectMembershipSerializer)
      end

      # GET /api/v1/projects/:project_id/members/:id
      def show
        authorize! @membership
        render_resource(@membership, ProjectMembershipSerializer)
      end

      # POST /api/v1/projects/:project_id/members
      def create
        @membership = @project.project_memberships.new(membership_params)
        authorize! @membership

        if @membership.save
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.invited",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, role: @membership.role },
            request: request
          )
          render_created(@membership, ProjectMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/projects/:project_id/members/:id
      def update
        authorize! @membership

        old_role = @membership.role

        if @membership.update(membership_update_params)
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.role_changed",
            resource: @membership,
            tracked_changes: { user_id: @membership.user_id, before: old_role, after: @membership.role },
            request: request
          )
          render_resource(@membership, ProjectMembershipSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/projects/:project_id/members/:id
      def destroy
        authorize! @membership

        user_id = @membership.user_id
        role = @membership.role

        if @membership.destroy
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "member.removed",
            resource: @membership,
            tracked_changes: { user_id: user_id, role: role },
            request: request
          )
          render_no_content
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      private

      def set_project
        @project = Project.find(params[:project_id])
      end

      def set_membership
        @membership = @project.project_memberships.find(params[:id])
      end

      def membership_params
        params.permit(:user_id, :role) # brakeman:ignore:MassAssignment - role is validated against ROLES whitelist
      end

      def membership_update_params
        params.permit(:role) # brakeman:ignore:MassAssignment - role is validated against ROLES whitelist
      end
    end
  end
end
