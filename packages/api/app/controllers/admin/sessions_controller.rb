# frozen_string_literal: true

module Admin
  class SessionsController < ActionController::Base
    include ActionController::Cookies
    include ProxyAware
    include AdminContentSecurityPolicy

    skip_forgery_protection

    # GET /admin/login — initiate OIDC redirect or show error page
    def new
      if params[:error].present? || params[:notice].present?
        @error = params[:error]
        @notice = params[:notice]
        render :error, layout: false
      else
        verifier = SecureRandom.urlsafe_base64(32)
        state    = SecureRandom.urlsafe_base64(32)
        session[:pkce_verifier] = verifier
        session[:oauth_state]   = state
        redirect_to auth_service.authorize_url(callback_url, verifier, state), allow_other_host: true
      end
    end

    # GET /admin/callback — handle OIDC callback with authorization code
    def callback
      unless valid_state?(params[:state])
        return redirect_to "/admin/login?error=#{ERB::Util.url_encode('Invalid or expired login attempt. Please try again.')}"
      end

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
    #
    # HTML: clear local admin auth, then RP-initiated Keycloak logout (admin UI logout button).
    # JSON: clear local admin auth only — used by the main-app SPA logout so a cross-surface
    # logout immediately invalidates the Administrate httponly cookie. The SPA then ends the
    # Keycloak SSO session via oidc-client-ts signoutRedirect.
    def destroy
      id_token = session[:admin_id_token]
      clear_admin_auth!

      respond_to do |format|
        format.json { head :no_content }
        format.all do
          post_logout_redirect = "#{external_origin}/admin/login?notice=Logged+out+successfully"
          redirect_to auth_service.logout_url(post_logout_redirect, id_token_hint: id_token),
                      allow_other_host: true
        end
      end
    end

    private

    def clear_admin_auth!
      cookies.delete(:admin_user_id, path: "/")
      cookies.delete(:admin_token, path: "/")
      reset_session
    end

    def auth_service
      @auth_service ||= Admin::KeycloakAuthService.new
    end

    def callback_url
      "#{external_origin}/admin/callback"
    end

    def valid_state?(returned_state)
      expected_state = session.delete(:oauth_state)
      expected_state.present? && returned_state.present? &&
        ActiveSupport::SecurityUtils.secure_compare(expected_state, returned_state)
    end
  end
end
