# frozen_string_literal: true

class Api::V1::ProjectCreateForm
  include ActiveModel::Model

  attr_reader :project

  delegate :to_model, :persisted?, :id, to: :project

  def initialize(project, current_user:)
    @project = project
    @current_user = current_user
    super()
  end

  def save
    Project.transaction do
      project.save!
      # Add creator as project owner (for org projects)
      if project.organization_project?
        project.project_memberships.create!(user: current_user, role: "owner")
      end
    end
    true
  rescue ActiveRecord::RecordInvalid => e
    merge_errors!(e.record.errors)
    false
  rescue ActiveRecord::RecordNotUnique => e
    merge_record_not_unique_error!(e)
    false
  end

  private

  attr_reader :current_user

  def merge_errors!(other_errors)
    other_errors.each { |error| errors.add(error.attribute, error.message) }
  end

  # Fallback for the race the model-level uniqueness checks can't catch
  # (two concurrent requests both pass validation before either commits).
  # Inspects which unique index fired instead of always blaming git_remote_url.
  def merge_record_not_unique_error!(exception)
    field = exception.message.include?("slug") ? :name : :git_remote_url
    errors.add(field, "has already been taken")
  end
end
