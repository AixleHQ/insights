# frozen_string_literal: true

FactoryBot.define do
  factory :user_project_favorite do
    user
    project
  end
end
