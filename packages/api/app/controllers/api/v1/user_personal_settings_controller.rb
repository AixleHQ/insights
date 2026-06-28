# frozen_string_literal: true

class Api::V1::UserPersonalSettingsController < Api::V1::BaseController
  # GET returns a non-persisted shell when no row exists yet (nil thresholds = use org defaults)
  def show
    settings = current_user.personal_setting || UserPersonalSettings.new(user: current_user)
    authorize! settings
    render_resource(settings, UserPersonalSettingsSerializer)
  end

  # PATCH always persists; uses find_or_create_by! + retry to survive concurrent first-writes
  def update
    settings = UserPersonalSettings.find_or_create_by!(user: current_user)
    authorize! settings
    changes_before = settings.attributes.slice(*personal_settings_params.keys.map(&:to_s))
    if settings.update(personal_settings_params)
      log_personal_alert_settings_update!(settings, changes_before)
      render_resource(settings, UserPersonalSettingsSerializer)
    else
      render json: { errors: settings.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  private

  def personal_settings_params
    params.require(:personal_settings).permit(
      :cost_threshold_cents, :token_threshold, :alert_email, :alert_slack
    )
  end

  def log_personal_alert_settings_update!(settings, changes_before)
    return unless current_organization

    alert_keys = personal_settings_params.keys.map(&:to_s) &
                 %w[cost_threshold_cents token_threshold alert_email alert_slack]
    return if alert_keys.empty?

    OrganizationAuditLog.log(
      organization: current_organization,
      actor: current_user,
      action: "alert.update",
      resource: settings,
      tracked_changes: {
        before: changes_before.slice(*alert_keys),
        after: settings.attributes.slice(*alert_keys),
        scope: "user_personal"
      },
      request: request
    )
  end
end
