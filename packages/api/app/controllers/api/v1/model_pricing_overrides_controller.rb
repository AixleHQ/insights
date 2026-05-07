# frozen_string_literal: true

module Api
  module V1
    class ModelPricingOverridesController < BaseController
      before_action :require_organization!
      before_action { authorize! current_organization, to: :manage_pricing_override? }
      before_action :set_override, only: %i[update destroy]

      # GET /api/v1/organizations/:organization_id/model_pricing/overrides
      def index
        overrides = current_organization.model_pricing_overrides.order(:model_pattern)
        render json: { data: ModelPricingOverrideSerializer.new(overrides).serialize }
      end

      # POST /api/v1/organizations/:organization_id/model_pricing/overrides
      def create
        override = current_organization.model_pricing_overrides.new(override_params)
        override.save!
        render json: { data: ModelPricingOverrideSerializer.new(override).serialize }, status: :created
      end

      # PUT /api/v1/organizations/:organization_id/model_pricing/overrides/:id
      def update
        @override.update!(override_params)
        render json: { data: ModelPricingOverrideSerializer.new(@override).serialize }
      end

      # DELETE /api/v1/organizations/:organization_id/model_pricing/overrides/:id
      def destroy
        @override.destroy!
        render_no_content
      end

      private

      def set_override
        @override = current_organization.model_pricing_overrides.find(params[:id])
      end

      def override_params
        params.permit(:model_pattern, :input_per_mtok, :output_per_mtok)
      end
    end
  end
end
