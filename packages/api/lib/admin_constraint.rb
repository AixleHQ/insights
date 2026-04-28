# frozen_string_literal: true

class AdminConstraint
  def matches?(request)
    return true if Rails.env.development?

    user_id = request.cookie_jar.signed[:admin_user_id]
    return false unless user_id

    User.find_by(id: user_id)&.global_admin? || false
  end
end
