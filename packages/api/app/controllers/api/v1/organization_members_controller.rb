# frozen_string_literal: true

module Api
  module V1
    class OrganizationMembersController < BaseController
      before_action :require_organization!
      before_action :set_membership, only: %i[show update destroy]

      # GET /api/v1/organizations/:organization_id/members
      def index
        memberships = current_organization.organization_memberships
                                          .includes(:user)
                                          .order('users.name')

        # Allow filtering by role
        memberships = memberships.where(role: params[:role]) if params[:role].present?

        render_collection(memberships, OrganizationMembershipSerializer)
      end

      # GET /api/v1/organizations/:organization_id/members/:id
      def show
        authorize! @membership
        render_resource(@membership, OrganizationMembershipSerializer)
      end

      # POST /api/v1/organizations/:organization_id/members
      def create
        @membership = current_organization.organization_memberships.new(membership_params)
        authorize! @membership

        if @membership.save
          render_created(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/organizations/:organization_id/members/:id
      def update
        authorize! @membership

        if @membership.update(membership_update_params)
          render_resource(@membership, OrganizationMembershipSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@membership.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:organization_id/members/:id
      def destroy
        authorize! @membership
        @membership.destroy!
        render_no_content
      end

      private

      def set_membership
        @membership = current_organization.organization_memberships.find(params[:id])
      end

      def membership_params
        params.permit(:user_id, :role)
      end

      def membership_update_params
        params.permit(:role)
      end
    end
  end
end
