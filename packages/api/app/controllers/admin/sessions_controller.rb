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
          secure: request.ssl? || request.headers["X-Forwarded-Proto"] == "https",
          expires: 1.day.from_now
        }
        # Retain the id_token so logout can end the Keycloak SSO session cleanly.
        session[:admin_id_token] = result.id_token
        redirect_to "/admin"
      else
        redirect_to "/admin/login?error=#{ERB::Util.url_encode(result.error)}"
      end
    end

    # DELETE /admin/logout
    def destroy
      id_token = session[:admin_id_token]

      # Clear local auth vectors first: signed session cookie and the JWT fallback.
      cookies.delete(:admin_user_id, path: "/")
      cookies.delete(:admin_token, path: "/")
      reset_session

      # Terminate the Keycloak SSO session too — otherwise the next /admin visit
      # silently re-authenticates via the still-active Keycloak session.
      post_logout_redirect = "#{external_origin}/admin/login?notice=Logged+out+successfully"
      redirect_to auth_service.logout_url(post_logout_redirect, id_token_hint: id_token),
                  allow_other_host: true
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
