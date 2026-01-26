class HealthController < ApplicationController
  skip_before_action :authenticate_user!
  skip_before_action :set_current_organization

  def show
    render json: {
      status: "ok",
      timestamp: Time.current.iso8601,
      version: Rails.version
    }
  end
end
