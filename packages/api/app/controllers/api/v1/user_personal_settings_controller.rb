# frozen_string_literal: true

class Api::V1::UserPersonalSettingsController < Api::V1::BaseController
  def show
    settings = current_user.personal_setting || UserPersonalSettings.new(user: current_user)
    authorize! settings
    render_resource(settings, UserPersonalSettingsSerializer)
  end

  def update
    settings = current_user.personal_setting || UserPersonalSettings.new(user: current_user)
    authorize! settings
    if settings.update(personal_settings_params)
      render_resource(settings, UserPersonalSettingsSerializer)
    else
      render json: { errors: settings.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def personal_settings_params
    params.require(:personal_settings).permit(
      :cost_threshold_cents, :token_threshold, :alert_email, :alert_slack
    )
  end
end
