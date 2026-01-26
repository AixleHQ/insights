# frozen_string_literal: true

class ProjectMinimalSerializer < BaseSerializer
  attributes :id, :name, :slug

  attribute :is_personal do |project|
    project.personal?
  end
end
