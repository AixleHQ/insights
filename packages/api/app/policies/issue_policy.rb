# frozen_string_literal: true

class IssuePolicy < ApplicationPolicy
  def show?
    return global_admin? if record.project.nil?
    project_member?(record.project) || global_admin?
  end

  def index?
    show?
  end

  relation_scope do |scope|
    next scope.none unless user
    scope.joins(:project).where(
      projects: { id: authorized_scope(Project.all).select(:id) }
    )
  end
end
