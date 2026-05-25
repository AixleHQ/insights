# frozen_string_literal: true

require "rails_helper"

RSpec.describe Backfills::ProjectAttributionBackfill do
  describe ".run" do
    let(:organization) { create(:organization) }
    let(:user) { create(:user) }

    before { create(:organization_membership, user: user, organization: organization) }

    context "when the user belongs to exactly one project in the org" do
      let(:project) { create(:project, organization: organization) }

      before do
        create(:project_membership, user: user, project: project)
      end

      it "sets project_id on matching tool_events in batches" do
        events = create_list(:tool_event, 3, user: user, organization: organization, project: nil)

        stats = described_class.run(dry_run: false)

        expect(ToolEvent.where(id: events.map(&:id)).distinct.pluck(:project_id)).to eq([ project.id ])
        expect(stats[:events_updated]).to eq(3)
        expect(stats[:organizations_scanned]).to eq(Organization.count)
      end

      it "is idempotent on a second run" do
        create_list(:tool_event, 2, user: user, organization: organization, project: nil)

        2.times { described_class.run(dry_run: false) }

        expect(ToolEvent.where(organization: organization, user: user).where.not(project_id: nil).count).to eq(2)
      end

      it "does not change rows in dry_run mode" do
        create_list(:tool_event, 2, user: user, organization: organization, project: nil)

        stats = nil
        expect {
          stats = described_class.run(dry_run: true)
        }.not_to change {
          ToolEvent.where(organization: organization, project_id: nil).count
        }

        expect(stats[:would_update_events]).to eq(2)
        expect(stats[:organizations_scanned]).to eq(Organization.count)
      end

      it "processes more than BATCH_SIZE rows across iterations" do
        create_list(:tool_event, 1_005, user: user, organization: organization, project: nil)

        described_class.run(dry_run: false)

        expect(ToolEvent.where(organization: organization, user: user, project_id: project.id).count).to eq(1_005)
      end

      it "when BACKFILL_FROM is set, only updates events with occurred_at on or after that time" do
        floor = 1.day.ago.beginning_of_day
        old_ev = create(
          :tool_event,
          user: user,
          organization: organization,
          project: nil,
          occurred_at: 2.days.ago
        )
        new_ev = create(
          :tool_event,
          user: user,
          organization: organization,
          project: nil,
          occurred_at: Time.current
        )

        original = ENV["BACKFILL_FROM"]
        ENV["BACKFILL_FROM"] = floor.iso8601
        begin
          described_class.run(dry_run: false)
        ensure
          if original.nil?
            ENV.delete("BACKFILL_FROM")
          else
            ENV["BACKFILL_FROM"] = original
          end
        end

        expect(old_ev.reload.project_id).to be_nil
        expect(new_ev.reload.project_id).to eq(project.id)
      end
    end

    context "when the user belongs to more than one project in the org" do
      let(:project_a) { create(:project, organization: organization) }
      let(:project_b) { create(:project, organization: organization) }

      before do
        create(:project_membership, user: user, project: project_a)
        create(:project_membership, user: user, project: project_b)
      end

      it "leaves project_id nil on their events" do
        ev = create(:tool_event, user: user, organization: organization, project: nil)

        described_class.run(dry_run: false)

        expect(ev.reload.project_id).to be_nil
      end

      it "logs unattributed NULL-project counts for visibility" do
        create(:tool_event, user: user, organization: organization, project: nil)

        expect { described_class.run(dry_run: false) }.to output(
          /user_id=#{user.id}.*multiple.*unattributed_events\(project_id NULL\)=1/
        ).to_stdout
      end
    end

    context "when the user has no project memberships in the org" do
      it "does not set project_id" do
        ev = create(:tool_event, user: user, organization: organization, project: nil)

        described_class.run(dry_run: false)

        expect(ev.reload.project_id).to be_nil
      end
    end

    context "when tool_events have NULL user_id" do
      let(:project) { create(:project, organization: organization) }

      before do
        create(:project_membership, user: user, project: project)
      end

      it "skips NULL-user rows and logs a count when present" do
        create(:tool_event, user: nil, organization: organization, project: nil)

        expect { described_class.run(dry_run: false) }.to output(/user_id NULL/).to_stdout
      end
    end
  end
end
