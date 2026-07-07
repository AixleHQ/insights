# frozen_string_literal: true

class Api::V1::ProjectUpdateForm
  include ActiveModel::Model

  attr_reader :project

  delegate :to_model, :persisted?, :id, to: :project

  def initialize(project)
    @project = project
    super()
  end

  def update(params)
    return true if project.update(params)

    merge_errors!(project.errors)
    false
  rescue ActiveRecord::RecordNotUnique => e
    merge_record_not_unique_error!(e)
    false
  end

  private

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
