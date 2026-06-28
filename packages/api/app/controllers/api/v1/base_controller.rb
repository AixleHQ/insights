# frozen_string_literal: true

module Api
  module V1
    class BaseController < ApplicationController
      include ActionPolicy::Controller

      wrap_parameters false

      authorize :user, through: :current_user
      authorize :organization, through: :current_organization

      rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
      rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity
      rescue_from ActionPolicy::Unauthorized, with: :render_forbidden

      protected

      def paginate(scope)
        page = (params[:page] || 1).to_i
        per_page = [ (params[:per_page] || Kaminari.config.default_per_page).to_i, Kaminari.config.max_per_page ].min
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
        serializer_kwargs = serializer_instance_kwargs(options[:serializer_params], subject: paginated)
        render json: {
          data: serializer_class.new(paginated, **serializer_kwargs).serialize,
          meta: pagination_meta(paginated)
        }, status: options[:status] || :ok
      end

      def render_resource(resource, serializer_class, options = {})
        status = options[:status] || :ok
        serializer_kwargs = serializer_instance_kwargs(options[:serializer_params], subject: resource)
        render json: {
          data: serializer_class.new(resource, **serializer_kwargs).serialize
        }, status: status
      end

      def render_created(resource, serializer_class, options = {})
        render_resource(resource, serializer_class, options.merge(status: :created))
      end

      def render_success(message: "Success", data: nil)
        response = { message: message }
        response[:data] = data if data
        render json: response, status: :ok
      end

      def render_no_content
        head :no_content
      end

      private

      # @param serializer_params [Hash, Proc] static params for Alba, or Proc(subject) => Hash
      def serializer_instance_kwargs(serializer_params, subject:)
        return {} if serializer_params.nil?

        params_hash = serializer_params.respond_to?(:call) ? serializer_params.call(subject) : serializer_params
        return {} if params_hash.nil?

        { params: params_hash }
      end

      def render_not_found(exception = nil)
        message = exception&.message || "Resource not found"
        render json: { error: "Not Found", message: message }, status: :not_found
      end

      def render_unprocessable_entity(exception)
        errors = if exception.record
                   format_validation_errors(exception.record.errors)
        else
                   { base: [ exception.message ] }
        end
        render json: { error: "Unprocessable Entity", errors: errors }, status: :unprocessable_content
      end

      def render_forbidden(exception = nil)
        message = exception&.result&.message || "Access denied"
        render json: { error: "Forbidden", message: message }, status: :forbidden
      end

      def render_bad_request(message)
        render json: { error: "Bad Request", message: message }, status: :bad_request
      end

      def format_validation_errors(errors)
        errors.to_hash(true).transform_values do |messages|
          messages.map { |msg| msg.is_a?(Hash) ? msg[:message] : msg }
        end
      end

      def parse_date_param(value, param_name)
        parsed = Time.zone.parse(value)
        raise ArgumentError if parsed.nil?
        parsed
      rescue ArgumentError
        render_bad_request("Invalid #{param_name} format — expected ISO 8601")
        nil
      end

      # Date-only params (YYYY-MM-DD from HTML date inputs) need inclusive day bounds.
      def parse_audit_log_date_param(value, param_name, boundary: :start)
        parsed = parse_date_param(value, param_name) or return nil
        return parsed unless date_only_param?(value)

        boundary == :end ? parsed.end_of_day : parsed.beginning_of_day
      end

      def date_only_param?(value)
        value.to_s.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      end
    end
  end
end
