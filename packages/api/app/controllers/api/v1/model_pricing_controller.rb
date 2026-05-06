# frozen_string_literal: true

module Api
  module V1
    class ModelPricingController < BaseController
      before_action :set_organization

      # GET /api/v1/organizations/:org_id/model_pricing
      def index
        authorize! @organization, to: :model_pricing?

        model_pricing = ModelPricingService.all_model_pricing.map { |name, p|
          { name: name, input_per_mtok: p[:input], output_per_mtok: p[:output] }
        }
        tool_pricing = ModelPricingService.all_tool_pricing.map { |name, p|
          { name: name, input_per_mtok: p[:input], output_per_mtok: p[:output] }
        }

        render json: { models: model_pricing, tools: tool_pricing }
      end

      private

      def set_organization
        @organization = Organization.find(params[:id])
      end
    end
  end
end
