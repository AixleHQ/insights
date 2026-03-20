# frozen_string_literal: true

class ImpersonationAuditService
  def self.log_started(user:, actor:, request:)
    metadata = { impersonator_email: actor.email }

    user.organizations.each do |organization|
      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: "impersonation.started",
        resource: user,
        metadata: metadata,
        request: request
      )
    end

    user.projects.each do |project|
      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: "impersonation.started",
        resource: user,
        metadata: metadata,
        request: request
      )
    end
  end

  def self.log_ended(user:, actor:, request:)
    metadata = { impersonator_email: request.env["jwt.impersonator_email"] }

    user.organizations.each do |organization|
      OrganizationAuditLog.log(
        organization: organization,
        actor: actor,
        action: "impersonation.ended",
        resource: user,
        metadata: metadata,
        request: request
      )
    end

    user.projects.each do |project|
      ProjectAuditLog.log(
        project: project,
        actor: actor,
        action: "impersonation.ended",
        resource: user,
        metadata: metadata,
        request: request
      )
    end
  end
end
