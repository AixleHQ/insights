# frozen_string_literal: true

module Api
  module V1
    class ModelPricingOverridesController < BaseController
      before_action :require_organization!
      before_action :set_override, only: %i[update destroy]

      # GET /api/v1/organizations/:organization_id/model_pricing/overrides
      def index
        authorize! current_organization, to: :manage_pricing_override?

        overrides = current_organization.model_pricing_overrides.order(:model_pattern)
        render json: { data: serialize_overrides(overrides) }
      end

      # POST /api/v1/organizations/:organization_id/model_pricing/overrides
      def create
        authorize! current_organization, to: :manage_pricing_override?

        override = current_organization.model_pricing_overrides.new(override_params)
        override.save!
        render json: { data: serialize_override(override) }, status: :created
      end

      # PUT /api/v1/organizations/:organization_id/model_pricing/overrides/:id
      def update
        authorize! current_organization, to: :manage_pricing_override?

        @override.update!(override_params)
        render json: { data: serialize_override(@override) }
      end

      # DELETE /api/v1/organizations/:organization_id/model_pricing/overrides/:id
      def destroy
        authorize! current_organization, to: :manage_pricing_override?

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

      def serialize_overrides(overrides)
        overrides.map { |o| serialize_override(o) }
      end

      def serialize_override(override)
        {
          id: override.id,
          model_pattern: override.model_pattern,
          input_per_mtok: override.input_per_mtok.to_f,
          output_per_mtok: override.output_per_mtok.to_f,
          created_at: override.created_at,
          updated_at: override.updated_at
        }
      end
    end
  end
end
