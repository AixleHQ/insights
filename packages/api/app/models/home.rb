# frozen_string_literal: true

# Placeholder model for Administrate navigation
# This represents the admin home/dashboard page, not an actual database model
class Home
  def self.model_name
    ActiveModel::Name.new(self, nil, "Home")
  end

  def self.table_name
    "homes"
  end

  def self.primary_key
    "id"
  end
end
