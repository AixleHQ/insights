# frozen_string_literal: true

class UnifiedAuditLogQueryBuilder
  VALID_SCOPES  = %w[organization project admin].freeze
  PER_TABLE_CAP = 1000

  attr_reader :truncated

  def initialize(organization:, params:)
    @organization = organization
    @params = params
    @truncated = false
  end

  def call
    results = []

    if include_scope?("organization")
      batch = build_org_scope.limit(PER_TABLE_CAP).to_a
      @truncated ||= batch.length == PER_TABLE_CAP
      results.concat(batch)
    end

    if include_scope?("project")
      batch = build_project_scope.limit(PER_TABLE_CAP).to_a
      @truncated ||= batch.length == PER_TABLE_CAP
      results.concat(batch)
    end

    if include_scope?("admin")
      batch = build_admin_scope.limit(PER_TABLE_CAP).to_a
      @truncated ||= batch.length == PER_TABLE_CAP
      results.concat(batch)
    end

    results.sort_by(&:created_at).reverse
  end

  private

  def include_scope?(name)
    @params[:scope].blank? || @params[:scope] == name
  end

  def project_ids
    @project_ids ||= @organization.projects.pluck(:id)
  end

  def build_org_scope
    scope = @organization.organization_audit_logs.includes(:actor).order(created_at: :desc)
    scope = scope.where(actor_id: @params[:actor_id]) if @params[:actor_id].present?
    apply_common_filters(scope)
  end

  def build_project_scope
    scope = ProjectAuditLog.where(project_id: project_ids).includes(:actor).order(created_at: :desc)
    scope = scope.where(actor_id: @params[:actor_id]) if @params[:actor_id].present?
    apply_common_filters(scope)
  end

  def build_admin_scope
    scope = AdminAuditLog
              .where(resource_type: "Organization", resource_id: @organization.id)
              .or(AdminAuditLog.where(resource_type: "Project", resource_id: project_ids))
              .includes(:admin_user)
              .order(created_at: :desc)
    scope = scope.where(admin_user_id: @params[:actor_id]) if @params[:actor_id].present?
    apply_common_filters(scope)
  end

  def apply_common_filters(scope)
    scope = scope.where(severity: @params[:severity]) if @params[:severity].present?
    scope = scope.where(outcome: @params[:outcome])   if @params[:outcome].present?
    scope = scope.where("created_at >= ?", @params[:from]) if @params[:from].present?
    scope = scope.where("created_at <= ?", @params[:to])   if @params[:to].present?
    scope
  end
end
