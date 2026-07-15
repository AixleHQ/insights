# frozen_string_literal: true

# OWASP A05-4 (AIX-371): Content-Security-Policy for the Administrate (HTML)
# admin UI. Scoped to admin controllers only — the JSON API surface has no HTML
# rendering for CSP to protect (see config/application.rb for the API-wide headers).
#
# 'unsafe-inline' is required for script-src and style-src because the admin
# layout (app/views/layouts/admin/application.html.erb) relies on an inline
# <script> config block, an inline onclick handler, and inline <style> blocks.
# A nonce-based strict CSP would require refactoring the whole admin theme —
# out of scope for this LOW-severity, defense-in-depth ticket.
module AdminContentSecurityPolicy
  extend ActiveSupport::Concern

  included do
    content_security_policy do |policy|
      policy.default_src :self
      policy.script_src  :self, "https://cdn.tailwindcss.com", :unsafe_inline
      policy.style_src   :self, "https://fonts.googleapis.com", :unsafe_inline
      policy.font_src    :self, "https://fonts.gstatic.com"
      policy.img_src     :self, :data
      policy.object_src  :none
      policy.base_uri    :self
      # The sign-out form (app/views/layouts/admin/application.html.erb) submits to
      # /admin/logout, which 302s to Keycloak's RP-initiated end_session endpoint
      # (AIX-563) so the SSO session is actually terminated. CSP's form-action
      # applies to the whole redirect chain resulting from a form submission, not
      # just the initial action URL — without allow-listing Keycloak's origin here,
      # browsers silently block that redirect and logout does nothing.
      policy.form_action :self, Keycloak.configuration.external_url
      policy.frame_ancestors :none
    end
  end
end
