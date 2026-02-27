# frozen_string_literal: true

module Admin
  class SessionsController < ActionController::Base
    include ActionController::Cookies

    protect_from_forgery with: :exception

    def new
      @error = params[:error]
      @notice = params[:notice]
      render html: login_form.html_safe, layout: false
    end

    def create
      email = params[:email]
      user = User.find_by(email: email)

      if user&.global_admin?
        # Use signed cookie instead of session
        cookies.signed[:admin_user_id] = {
          value: user.id,
          httponly: true,
          expires: 1.day.from_now
        }
        redirect_to '/admin'
      else
        redirect_to '/admin/login?error=Invalid+credentials+or+not+a+global+admin'
      end
    end

    def destroy
      cookies.delete(:admin_user_id)
      redirect_to '/admin/login?notice=Logged+out+successfully'
    end

    private

    def login_form
      messages = []
      messages << "<div class='alert'>#{@error}</div>" if @error.present?
      messages << "<div class='notice'>#{@notice}</div>" if @notice.present?

      <<~HTML
        <!DOCTYPE html>
        <html>
        <head>
          <title>Admin Login - DB90</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .login-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px; }
            h1 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #333; }
            label { display: block; margin-bottom: 0.5rem; color: #666; font-size: 0.875rem; }
            input[type="email"] { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; margin-bottom: 1rem; box-sizing: border-box; }
            button { width: 100%; padding: 0.75rem; background: #0066cc; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
            button:hover { background: #0052a3; }
            .alert { background: #fee; color: #c00; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.875rem; }
            .notice { background: #efe; color: #060; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.875rem; }
          </style>
        </head>
        <body>
          <div class="login-box">
            <h1>Admin Login</h1>
            #{messages.join}
            <form action="/admin/login" method="post">
              <input type="hidden" name="authenticity_token" value="#{form_authenticity_token}">
              <label for="email">Email</label>
              <input type="email" name="email" id="email" placeholder="admin@db90.io" required autofocus>
              <button type="submit">Sign In</button>
            </form>
          </div>
        </body>
        </html>
      HTML
    end
  end
end
