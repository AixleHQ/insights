# frozen_string_literal: true

module Api
  module V1
    class WebhookDeliveriesController < BaseController
      before_action :require_organization!
      before_action :set_delivery, only: [ :retry_action ]

      # GET /api/v1/organizations/:organization_id/webhook_deliveries
      def index
        authorize! current_organization, to: :index?, with: WebhookDeliveryPolicy

        deliveries = authorized_scope(
          WebhookDelivery.joins(:organization_connector)
                         .where(organization_connectors: { organization_id: current_organization.id }),
          with: WebhookDeliveryPolicy
        ).order(created_at: :desc)

        deliveries = deliveries.where(status: params[:status])     if params[:status].present?
        deliveries = deliveries.where(provider: params[:provider]) if params[:provider].present?

        if params[:date_from].present?
          date_from = parse_date_param(params[:date_from], :date_from) or return
          deliveries = deliveries.where("webhook_deliveries.created_at >= ?", date_from)
        end

        if params[:date_to].present?
          date_to = parse_date_param(params[:date_to], :date_to) or return
          deliveries = deliveries.where("webhook_deliveries.created_at <= ?", date_to.end_of_day)
        end

        render_collection(deliveries, WebhookDeliverySerializer)
      end

      # POST /api/v1/organizations/:organization_id/webhook_deliveries/:id/retry
      def retry_action
        authorize! @delivery, to: :retry?

        payload = RawEventStore.fetch(@delivery.raw_event_key)
        if payload.nil?
          return render json: { error: "Raw payload has expired and cannot be retried" },
                        status: :unprocessable_content
        end

        rows = WebhookDelivery.where(id: @delivery.id, status: "failed")
                              .update_all(status: "pending", updated_at: Time.current)

        if rows.zero?
          return render json: { error: "Only failed deliveries can be retried" },
                        status: :unprocessable_content
        end

        @delivery.status     = "pending"
        @delivery.updated_at = Time.current

        WebhookRouter.dispatch(
          @delivery.organization_connector,
          @delivery.event_type,
          @delivery.raw_event_key,
          payload:     payload,
          delivery_id: @delivery.id
        )

        render json: { data: WebhookDeliverySerializer.new(@delivery).serialize }, status: :accepted
      end

      private

      def set_delivery
        @delivery = WebhookDelivery
          .joins(:organization_connector)
          .where(organization_connectors: { organization_id: current_organization.id })
          .find(params[:id])
      end
    end
  end
end
