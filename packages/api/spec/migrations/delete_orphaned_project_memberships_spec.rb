# frozen_string_literal: true

require "rails_helper"
require Rails.root.join("db/migrate/20260722153000_delete_orphaned_project_memberships.rb")

RSpec.describe DeleteOrphanedProjectMemberships, type: :migration do
  subject(:migration) { described_class.new }

  let(:organization) { create(:organization) }
  let(:user) { create(:user) }
  let(:project) { create(:project, organization: organization) }

  it "deletes org-project memberships whose user is no longer an org member" do
    create(:organization_membership, user: user, organization: organization, role: "member")
    orphan = create(:project_membership, user: user, project: project, role: "member")
    # Simulate the pre-fix hard-delete of org membership without cascading project rows.
    OrganizationMembership.where(user_id: user.id, organization_id: organization.id).delete_all

    expect(ProjectMembership.exists?(orphan.id)).to be true

    migration.up

    expect(ProjectMembership.exists?(orphan.id)).to be false
  end

  it "keeps project memberships for users who are still org members" do
    create(:organization_membership, user: user, organization: organization, role: "member")
    kept = create(:project_membership, user: user, project: project, role: "member")

    migration.up

    expect(ProjectMembership.exists?(kept.id)).to be true
  end

  it "does not delete personal-project memberships" do
    personal = create(:project, :personal, owner: user)
    personal_membership = create(:project_membership, :owner, user: user, project: personal)

    migration.up

    expect(ProjectMembership.exists?(personal_membership.id)).to be true
  end
end
