# frozen_string_literal: true

module Api
  module V1
    class PublicInvitationsController < ApplicationController
      # Skip authentication for show (viewing invitation)
      skip_before_action :authenticate_user!, only: [ :show ]
      skip_before_action :set_current_organization, only: [ :show ]

      rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

      # GET /api/v1/invitations/:token
      # Public endpoint to view invitation details
      def show
        @invitation = Invitation.find_by!(token: params[:token])

        render json: {
          data: InvitationPublicSerializer.new(@invitation).serialize
        }
      end

      # POST /api/v1/invitations/:token/accept
      # Requires authentication - user must be logged in to accept
      def accept
        @invitation = Invitation.find_by!(token: params[:token])

        # Check if invitation is still valid
        unless @invitation.active?
          status = @invitation.revoked? ? "revoked" : "expired"
          return render json: {
            error: "Unprocessable Entity",
            message: "This invitation has been #{status}"
          }, status: :unprocessable_content
        end

        # Check if user is already a member
        if @invitation.organization.members.include?(current_user)
          return render json: {
            error: "Unprocessable Entity",
            message: "You are already a member of this organization"
          }, status: :unprocessable_content
        end

        # Accept the invitation
        membership = @invitation.accept!(current_user)

        if membership
          render json: {
            message: "Invitation accepted successfully",
            data: {
              organization: {
                id: @invitation.organization.id,
                name: @invitation.organization.name,
                slug: @invitation.organization.slug
              },
              role: @invitation.role
            }
          }, status: :ok
        else
          render json: {
            error: "Unprocessable Entity",
            message: "Failed to accept invitation"
          }, status: :unprocessable_content
        end
      end

      # GET /api/v1/invitations/check
      # Check if user has any pending invitations for their email
      def check
        pending_invitations = Invitation.pending
                                        .where(email: current_user.email)
                                        .where("expires_at > ?", Time.current)
                                        .includes(:organization, :invited_by)

        render json: {
          data: pending_invitations.map { |inv| InvitationPublicSerializer.new(inv).serialize }
        }
      end

      private

      def render_not_found(exception = nil)
        message = exception&.message || "Resource not found"
        render json: { error: "Not Found", message: message }, status: :not_found
      end
    end
  end
end
