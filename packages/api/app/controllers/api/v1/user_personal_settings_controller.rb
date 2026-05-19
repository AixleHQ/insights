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
    if settings.update(personal_settings_params)
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
end
