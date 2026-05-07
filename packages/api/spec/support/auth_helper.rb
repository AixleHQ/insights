# frozen_string_literal: true

module AuthHelper
  def jwt_claims_for(user)
    {
      'sub' => user.keycloak_sub,
      'email' => user.email,
      'name' => user.name,
      'preferred_username' => user.email.split('@').first,
      'iat' => Time.current.to_i,
      'exp' => 1.hour.from_now.to_i
    }
  end

  def authenticate_user(user)
    claims = jwt_claims_for(user)
    allow_any_instance_of(ApplicationController).to receive(:authenticate_user!) do |controller|
      controller.instance_variable_set(:@current_user, user)
      controller.instance_variable_set(:@jwt_claims, claims)
    end
    request.env['jwt.claims'] = claims if respond_to?(:request)
  end

  def auth_headers_for(user)
    {
      'Authorization' => "Bearer test-token-for-#{user.id}",
      'Content-Type' => 'application/json'
    }
  end

  def org_headers(organization, user = nil)
    headers = { 'X-Organization-ID' => organization.id.to_s }
    headers.merge!(auth_headers_for(user)) if user
    headers
  end

  def authenticated_get(path, user:, organization: nil, params: {})
    headers = auth_headers_for(user)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    get path, params: params, headers: headers
  end

  def authenticated_post(path, user:, organization: nil, params: {})
    headers = auth_headers_for(user)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    post path, params: params.to_json, headers: headers
  end

  def authenticated_patch(path, user:, organization: nil, params: {})
    headers = auth_headers_for(user)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    patch path, params: params.to_json, headers: headers
  end

  def authenticated_put(path, user:, organization: nil, params: {})
    headers = auth_headers_for(user)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    put path, params: params.to_json, headers: headers
  end

  def authenticated_delete(path, user:, organization: nil)
    headers = auth_headers_for(user)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    delete path, headers: headers
  end

  def impersonation_headers_for(user:, impersonator:)
    {
      'Authorization' => "Bearer test-impersonation-#{user.id}-by-#{impersonator.id}",
      'Content-Type' => 'application/json'
    }
  end

  def impersonated_post(path, user:, impersonator:, organization: nil, params: {})
    headers = impersonation_headers_for(user: user, impersonator: impersonator)
    headers['X-Organization-ID'] = organization.id.to_s if organization
    post path, params: params.to_json, headers: headers
  end

  # Like impersonated_post but embeds a specific jti into the test token so
  # revocation via ImpersonationService.revoke_token can be verified in request specs.
  def impersonated_post_with_jti(path, user:, impersonator:, jti:, organization: nil, params: {})
    token = "Bearer test-impersonation-#{user.id}-by-#{impersonator.id}-jti-#{jti}"
    headers = { 'Authorization' => token, 'Content-Type' => 'application/json' }
    headers['X-Organization-ID'] = organization.id.to_s if organization
    post path, params: params.to_json, headers: headers
  end
end

RSpec.configure do |config|
  config.include AuthHelper, type: :request
  config.include AuthHelper, type: :controller
end
