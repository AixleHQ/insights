# frozen_string_literal: true

module Api
  module V1
    class InvitationsController < BaseController
      before_action :require_organization!
      before_action :set_invitation, only: %i[show destroy resend]

      # GET /api/v1/organizations/:organization_id/invitations
      def index
        invitations = current_organization.invitations
                                          .includes(:invited_by, :organization)
                                          .order(created_at: :desc)

        # Allow filtering by status
        invitations = invitations.where(status: params[:status]) if params[:status].present?

        authorize! invitations.first || Invitation.new(organization: current_organization)
        render_collection(invitations, InvitationSerializer)
      end

      # GET /api/v1/organizations/:organization_id/invitations/:id
      def show
        authorize! @invitation
        render_resource(@invitation, InvitationSerializer)
      end

      # POST /api/v1/organizations/:organization_id/invitations
      def create
        @invitation = current_organization.invitations.new(invitation_params)
        @invitation.invited_by = current_user
        authorize! @invitation

        # Check if user is already a member
        existing_user = User.find_by(email: @invitation.email)
        if existing_user && current_organization.members.include?(existing_user)
          return render json: {
            error: 'Unprocessable Entity',
            errors: { email: ['is already a member of this organization'] }
          }, status: :unprocessable_entity
        end

        if @invitation.save
          # Send invitation email
          InvitationMailer.invite(@invitation).deliver_later

          render_created(@invitation, InvitationSerializer)
        else
          render json: {
            error: 'Unprocessable Entity',
            errors: format_validation_errors(@invitation.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:organization_id/invitations/:id
      def destroy
        authorize! @invitation

        if @invitation.revoke!
          render_no_content
        else
          render json: {
            error: 'Unprocessable Entity',
            message: 'Cannot revoke this invitation'
          }, status: :unprocessable_entity
        end
      end

      # POST /api/v1/organizations/:organization_id/invitations/:id/resend
      def resend
        authorize! @invitation

        unless @invitation.pending?
          return render json: {
            error: 'Unprocessable Entity',
            message: 'Can only resend pending invitations'
          }, status: :unprocessable_entity
        end

        # Update expiration
        @invitation.update!(expires_at: 7.days.from_now)

        # Resend email
        InvitationMailer.invite(@invitation).deliver_later

        render_resource(@invitation, InvitationSerializer)
      end

      private

      def set_invitation
        @invitation = current_organization.invitations.find(params[:id])
      end

      def invitation_params
        params.permit(:email, :role)
      end
    end
  end
end
