# frozen_string_literal: true

module Api
  module V1
    class OrganizationProviderSettingsController < BaseController
      before_action :require_organization!

      # GET /api/v1/organizations/:organization_id/organization_provider_settings
      def index
        authorize! current_organization, with: OrganizationProviderSettingPolicy
        settings = current_organization.organization_provider_settings.order(:provider)
        render_collection(settings, OrganizationProviderSettingSerializer)
      end

      # PATCH /api/v1/organizations/:organization_id/organization_provider_settings/:provider
      def update
        authorize! current_organization, with: OrganizationProviderSettingPolicy

        provider_key = params[:provider]
        unless OrganizationProviderSetting::KNOWN_PROVIDERS.include?(provider_key)
          return render_bad_request("Unknown provider: #{provider_key}")
        end

        enabled_value = provider_setting_params[:enabled]
        return render_bad_request("enabled is required") if enabled_value.nil?

        now = Time.current
        OrganizationProviderSetting.upsert(
          {
            organization_id: current_organization.id,
            provider: provider_key,
            enabled: enabled_value,
            created_at: now,
            updated_at: now
          },
          unique_by: %i[organization_id provider],
          update_only: %i[enabled updated_at],
          record_timestamps: false
        )
        setting = current_organization.organization_provider_settings.find_by!(provider: provider_key)
        render_resource(setting, OrganizationProviderSettingSerializer)
      end

      private

      def provider_setting_params
        params.require(:organization_provider_setting).permit(:enabled)
      end
    end
  end
end
