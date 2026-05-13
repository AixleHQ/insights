# frozen_string_literal: true

module Api
  module V1
    class NotificationRoutesController < BaseController
      before_action :require_organization!
      before_action :set_route, only: %i[update destroy]

      # GET /api/v1/organizations/:organization_id/notification_routes
      def index
        authorize! current_organization, to: :index?, with: NotificationRoutePolicy
        routes = current_organization.notification_routes.includes(:recipient_user).order(:notification_type)
        render_collection(routes, NotificationRouteSerializer)
      end

      # POST /api/v1/organizations/:organization_id/notification_routes
      def create
        @route = current_organization.notification_routes.new(route_params)
        authorize! @route
        if @route.save
          render_created(@route, NotificationRouteSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@route.errors)
          }, status: :unprocessable_content
        end
      rescue ActiveRecord::RecordNotUnique
        render json: {
          error: "Unprocessable Entity",
          errors: { base: [ "A notification route with these settings already exists" ] }
        }, status: :unprocessable_content
      end

      # PATCH /api/v1/organizations/:organization_id/notification_routes/:id
      def update
        authorize! @route
        if @route.update(route_params)
          render_resource(@route, NotificationRouteSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@route.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/organizations/:organization_id/notification_routes/:id
      def destroy
        authorize! @route
        @route.destroy!
        render_no_content
      end

      private

      def set_route
        @route = current_organization.notification_routes.find(params[:id])
      end

      def route_params
        params.permit(:notification_type, :recipient_type, :recipient_role,
                      :recipient_user_id, :enabled)
      end
    end
  end
end
