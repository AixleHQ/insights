# frozen_string_literal: true

module Api
  module V1
    class BaseController < ApplicationController
      include ActionPolicy::Controller

      authorize :user, through: :current_user
      authorize :organization, through: :current_organization

      rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
      rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity
      rescue_from ActionPolicy::Unauthorized, with: :render_forbidden

      protected

      def paginate(scope)
        page = (params[:page] || 1).to_i
        per_page = [(params[:per_page] || Kaminari.config.default_per_page).to_i, Kaminari.config.max_per_page].min
        per_page = 1 if per_page < 1

        scope.page(page).per(per_page)
      end

      def pagination_meta(collection)
        {
          current_page: collection.current_page,
          total_pages: collection.total_pages,
          total_count: collection.total_count,
          per_page: collection.limit_value
        }
      end

      def render_collection(collection, serializer_class, options = {})
        paginated = paginate(collection)
        render json: {
          data: serializer_class.new(paginated).serialize,
          meta: pagination_meta(paginated)
        }, status: options[:status] || :ok
      end

      def render_resource(resource, serializer_class, options = {})
        render json: {
          data: serializer_class.new(resource).serialize
        }, status: options[:status] || :ok
      end

      def render_created(resource, serializer_class)
        render_resource(resource, serializer_class, status: :created)
      end

      def render_success(message: 'Success', data: nil)
        response = { message: message }
        response[:data] = data if data
        render json: response, status: :ok
      end

      def render_no_content
        head :no_content
      end

      private

      def render_not_found(exception = nil)
        message = exception&.message || 'Resource not found'
        render json: { error: 'Not Found', message: message }, status: :not_found
      end

      def render_unprocessable_entity(exception)
        errors = if exception.record
                   format_validation_errors(exception.record.errors)
                 else
                   { base: [exception.message] }
                 end
        render json: { error: 'Unprocessable Entity', errors: errors }, status: :unprocessable_entity
      end

      def render_forbidden(exception = nil)
        message = exception&.result&.message || 'Access denied'
        render json: { error: 'Forbidden', message: message }, status: :forbidden
      end

      def render_bad_request(message)
        render json: { error: 'Bad Request', message: message }, status: :bad_request
      end

      def format_validation_errors(errors)
        errors.to_hash(true).transform_values do |messages|
          messages.map { |msg| msg.is_a?(Hash) ? msg[:message] : msg }
        end
      end
    end
  end
end
