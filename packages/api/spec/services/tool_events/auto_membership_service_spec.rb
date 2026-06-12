# frozen_string_literal: true

require "rails_helper"

RSpec.describe ToolEvents::AutoMembershipService do
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }
  let(:user) { create(:user) }

  before { create(:organization_membership, user: user, organization: organization) }

  describe ".call" do
    context "when user and project are present on an org project" do
      it "creates a ProjectMembership with role viewer" do
        tool_event = build(:tool_event, user: user, project: project, organization: organization)
        expect { described_class.call(tool_event) }
          .to change(ProjectMembership, :count).by(1)
        expect(ProjectMembership.last.role).to eq("viewer")
      end

      it "does not create a duplicate membership" do
        create(:project_membership, user: user, project: project, role: "member")
        tool_event = build(:tool_event, user: user, project: project, organization: organization)
        expect { described_class.call(tool_event) }
          .not_to change(ProjectMembership, :count)
      end

      it "does not downgrade an existing role" do
        create(:project_membership, user: user, project: project, role: "member")
        tool_event = build(:tool_event, user: user, project: project, organization: organization)
        described_class.call(tool_event)
        expect(ProjectMembership.find_by(user: user, project: project).role).to eq("member")
      end

      it "sets created_by to nil for auto-memberships" do
        tool_event = build(:tool_event, user: user, project: project, organization: organization)
        described_class.call(tool_event)
        expect(ProjectMembership.last.created_by).to be_nil
      end
    end

    context "when user_id is nil" do
      it "does nothing" do
        tool_event = build(:tool_event, user: nil, project: project, organization: organization)
        expect { described_class.call(tool_event) }.not_to change(ProjectMembership, :count)
      end
    end

    context "when project_id is nil" do
      it "does nothing" do
        tool_event = build(:tool_event, user: user, project: nil, organization: organization)
        expect { described_class.call(tool_event) }.not_to change(ProjectMembership, :count)
      end
    end

    context "when project_id is present but project record is missing" do
      it "does nothing and does not raise" do
        tool_event = build(:tool_event, user: user, project: nil, organization: organization)
        tool_event.project_id = SecureRandom.uuid

        expect { described_class.call(tool_event) }.not_to raise_error
        expect(ProjectMembership.count).to eq(0)
      end
    end

    context "when project is personal" do
      let(:personal_project) { create(:project, :personal) }

      it "does nothing" do
        tool_event = build(:tool_event, user: user, project: personal_project, organization: organization)
        expect { described_class.call(tool_event) }.not_to change(ProjectMembership, :count)
      end
    end

    context "when user is not an org member" do
      let(:non_member) { create(:user) }

      it "does not raise and does not create membership" do
        tool_event = build(:tool_event, user: non_member, project: project, organization: organization)
        expect { described_class.call(tool_event) }.not_to raise_error
        expect(ProjectMembership.count).to eq(0)
      end
    end

    context "when tool_event has no organization_id" do
      it "does nothing (treats missing org as mismatch)" do
        tool_event = build(:tool_event, user: user, project: project, organization: nil)
        tool_event.organization_id = nil

        expect { described_class.call(tool_event) }.not_to change(ProjectMembership, :count)
      end
    end

    context "when project organization does not match tool event organization" do
      let(:other_organization) { create(:organization) }
      let(:cross_org_project) { create(:project, organization: other_organization) }

      before { create(:organization_membership, user: user, organization: other_organization) }

      it "does nothing" do
        tool_event = build(:tool_event, user: user, project: cross_org_project, organization: organization)
        expect { described_class.call(tool_event) }.not_to change(ProjectMembership, :count)
      end
    end
  end

  describe ".call_with" do
    it "creates a membership from raw attributes (no ToolEvent instance)" do
      expect {
        described_class.call_with(user_id: user.id, project_id: project.id, organization_id: organization.id)
      }.to change(ProjectMembership, :count).by(1)
      expect(ProjectMembership.last.role).to eq("viewer")
    end

    it "reports unexpected errors to Rollbar and returns nil instead of raising" do
      allow(ProjectMembership).to receive(:find_or_create_by!).and_raise(RuntimeError, "boom")
      expect(Rollbar).to receive(:error)

      result = nil
      expect {
        result = described_class.call_with(user_id: user.id, project_id: project.id, organization_id: organization.id)
      }.not_to raise_error
      expect(result).to be_nil
    end
  end
end
