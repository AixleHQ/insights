# frozen_string_literal: true

module Api
  module V1
    class OrganizationsController < BaseController
      before_action :set_organization, only: %i[show update destroy retention_policy update_retention_policy settings update_setting destroy_setting]

      # GET /api/v1/organizations
      def index
        orgs = authorized_scope(Organization.all).order(:name)
        render_collection(orgs, OrganizationSerializer)
      end

      # GET /api/v1/organizations/:id
      def show
        authorize! @organization
        render_resource(@organization, OrganizationFullSerializer)
      end

      # POST /api/v1/organizations
      def create
        @organization = Organization.new(organization_params)
        authorize! @organization

        Organization.transaction do
          @organization.save!
          # Make the creator an owner
          @organization.organization_memberships.create!(user: current_user, role: "owner")
        end

        render_created(@organization, OrganizationSerializer)
      rescue ActiveRecord::RecordInvalid => e
        render json: {
          error: "Unprocessable Entity",
          errors: format_validation_errors(e.record.errors)
        }, status: :unprocessable_entity
      end

      # PATCH /api/v1/organizations/:id
      def update
        authorize! @organization

        if @organization.update(organization_params)
          render_resource(@organization, OrganizationSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@organization.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:id
      def destroy
        authorize! @organization
        @organization.destroy!
        render_no_content
      end

      # GET /api/v1/organizations/:id/retention_policy
      def retention_policy
        authorize! @organization, to: :retention_policy?
        render_resource(@organization.retention_policy, OrganizationRetentionPolicySerializer)
      end

      # PATCH /api/v1/organizations/:id/retention_policy
      def update_retention_policy
        authorize! @organization, to: :retention_policy?

        policy = @organization.retention_policy || @organization.build_retention_policy
        if policy.update(retention_policy_params)
          render_resource(policy, OrganizationRetentionPolicySerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(policy.errors)
          }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/organizations/:id/settings
      def settings
        authorize! @organization, to: :settings?
        settings = @organization.organization_settings.order(:key)
        render json: {
          data: OrganizationSettingSerializer.new(settings).serialize
        }
      end

      # PUT /api/v1/organizations/:id/settings/:key
      def update_setting
        authorize! @organization, to: :settings?

        setting = @organization.organization_settings.find_or_initialize_by(key: params[:key])
        action = setting.new_record? ? "settings.create" : "settings.update"
        old_value = setting.value

        setting.value = params[:value]

        if setting.save
          OrganizationAuditLog.log(
            organization: @organization,
            actor: current_user,
            action: action,
            resource: setting,
            tracked_changes: { key: params[:key], before: old_value, after: setting.value },
            request: request
          )
          render_resource(setting, OrganizationSettingSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(setting.errors)
          }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/organizations/:id/settings/:key
      def destroy_setting
        authorize! @organization, to: :settings?

        setting = @organization.organization_settings.find_by!(key: params[:key])
        setting.destroy!

        OrganizationAuditLog.log(
          organization: @organization,
          actor: current_user,
          action: "settings.delete",
          tracked_changes: { key: params[:key], before: setting.value },
          request: request
        )

        render_no_content
      end

      private

      def set_organization
        @organization = Organization.find(params[:id])
      end

      def organization_params
        params.permit(:name, :slug, :description, :is_active)
      end

      def retention_policy_params
        params.permit(:raw_event_ttl, :tool_events_retention, :hourly_aggregate_retention,
                      :daily_aggregate_retention, :retention_reason)
      end
    end
  end
end
