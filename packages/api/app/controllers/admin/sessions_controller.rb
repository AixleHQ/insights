# frozen_string_literal: true

module Admin
  class SessionsController < ActionController::Base
    include ActionController::Cookies
    include ProxyAware

    skip_forgery_protection

    # GET /admin/login — initiate OIDC redirect or show error page
    def new
      if params[:error].present? || params[:notice].present?
        @error = params[:error]
        @notice = params[:notice]
        render :error, layout: false
      else
        verifier = SecureRandom.urlsafe_base64(32)
        session[:pkce_verifier] = verifier
        redirect_to auth_service.authorize_url(callback_url, verifier), allow_other_host: true
      end
    end

    # GET /admin/callback — handle OIDC callback with authorization code
    def callback
      result = auth_service.authenticate(params[:code], session.delete(:pkce_verifier), callback_url)

      if result.success?
        cookies.signed[:admin_user_id] = {
          value: result.user.id,
          httponly: true,
          secure: request.ssl? || request.headers['X-Forwarded-Proto'] == 'https',
          expires: 1.day.from_now
        }
        redirect_to '/admin'
      else
        redirect_to "/admin/login?error=#{ERB::Util.url_encode(result.error)}"
      end
    end

    # DELETE /admin/logout
    def destroy
      cookies.delete(:admin_user_id)
      redirect_to '/admin/login?notice=Logged+out+successfully'
    end

    private

    def auth_service
      @auth_service ||= Admin::KeycloakAuthService.new
    end

    def callback_url
      "#{external_origin}/admin/callback"
    end
  end
end
