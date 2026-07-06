# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Organizations', type: :request do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :global_admin) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'owner') }

  describe 'GET /api/v1/organizations' do
    it 'returns organizations the user is a member of' do
      other_org = create(:organization)

      authenticated_get '/api/v1/organizations', user: user

      expect_success
      expect(json_data.map { |o| o[:id] }).to include(organization.id)
      expect(json_data.map { |o| o[:id] }).not_to include(other_org.id)
    end

    context 'as global admin' do
      it 'returns all organizations' do
        other_org = create(:organization)

        authenticated_get '/api/v1/organizations', user: admin_user

        expect_success
        expect(json_data.map { |o| o[:id] }).to include(organization.id)
        expect(json_data.map { |o| o[:id] }).to include(other_org.id)
      end
    end
  end

  describe 'GET /api/v1/organizations/:id' do
    it 'returns the organization' do
      authenticated_get "/api/v1/organizations/#{organization.id}", user: user

      expect_success
      expect(json_data[:id]).to eq(organization.id)
      expect(json_data[:name]).to eq(organization.name)
    end

    it 'returns 404 for non-members (organization not visible via authorized_scope)' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}", user: non_member

      expect_not_found
    end
  end

  describe 'POST /api/v1/organizations' do
    it 'creates a new organization and makes the user an owner' do
      authenticated_post '/api/v1/organizations', user: user, params: { name: 'New Org', description: 'Test' }

      expect_created
      expect(json_data[:name]).to eq('New Org')

      new_org = Organization.find(json_data[:id])
      expect(new_org.organization_memberships.find_by(user: user).role).to eq('owner')
    end
  end

  describe 'PATCH /api/v1/organizations/:id' do
    it 'updates the organization as admin' do
      authenticated_patch "/api/v1/organizations/#{organization.id}", user: user, params: { name: 'Updated Name' }

      expect_success
      expect(json_data[:name]).to eq('Updated Name')
    end

    it 'returns 403 for non-admins' do
      member = create(:user)
      create(:organization_membership, user: member, organization: organization, role: 'member')

      authenticated_patch "/api/v1/organizations/#{organization.id}", user: member, params: { name: 'Updated Name' }

      expect_forbidden
    end
  end

  describe 'DELETE /api/v1/organizations/:id' do
    it 'deletes the organization as owner' do
      authenticated_delete "/api/v1/organizations/#{organization.id}", user: user

      expect_no_content
      expect(Organization.find_by(id: organization.id)).to be_nil
    end

    it 'returns 403 for members' do
      member = create(:user)
      create(:organization_membership, user: member, organization: organization, role: 'member')

      authenticated_delete "/api/v1/organizations/#{organization.id}", user: member

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:id/retention_policy' do
    it 'returns the retention policy' do
      # Organization creates a default retention policy after_create
      authenticated_get "/api/v1/organizations/#{organization.id}/retention_policy", user: user

      expect_success
      expect(json_data[:organizationId]).to eq(organization.id)
    end
  end

  describe 'PATCH /api/v1/organizations/:id/retention_policy' do
    it 'updates the retention policy' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: '48_hours', tool_events_retention: '90_days' }

      expect_success
      expect(json_data[:rawEventTtl]).to eq('48_hours')
      expect(json_data[:toolEventsRetention]).to eq('90_days')
    end

    it 'returns the full policy in camelCase' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: '6_hours' }

      expect_success
      expect(json_data).to have_key(:rawEventTtl)
      expect(json_data).to have_key(:toolEventsRetention)
      expect(json_data).to have_key(:hourlyAggregateRetention)
      expect(json_data).to have_key(:dailyAggregateRetention)
    end

    it 'returns 422 for an invalid raw_event_ttl value' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: '1_year' }

      expect_unprocessable
      expect(json_response[:errors]).to have_key(:raw_event_ttl)
    end

    it 'returns 422 for an invalid tool_events_retention value' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { tool_events_retention: '7_days' }

      expect_unprocessable
      expect(json_response[:errors]).to have_key(:tool_events_retention)
    end

    it 'returns 422 for an invalid hourly_aggregate_retention value' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { hourly_aggregate_retention: '30_days' }

      expect_unprocessable
      expect(json_response[:errors]).to have_key(:hourly_aggregate_retention)
    end

    it 'returns 422 for an invalid daily_aggregate_retention value' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { daily_aggregate_retention: '90_days' }

      expect_unprocessable
      expect(json_response[:errors]).to have_key(:daily_aggregate_retention)
    end

    it 'does not update when an invalid value is submitted' do
      original_ttl = organization.retention_policy.raw_event_ttl

      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { raw_event_ttl: 'bogus_value' }

      expect_unprocessable
      expect(organization.retention_policy.reload.raw_event_ttl).to eq(original_ttl)
    end

    it 'returns 403 for non-admins' do
      member = create(:user)
      create(:organization_membership, user: member, organization: organization, role: 'member')

      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: member,
                          params: { raw_event_ttl: '6_hours' }

      expect_forbidden
    end

    it 'persists cost_threshold_cents and token_threshold alert fields' do
      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { cost_threshold_cents: 500, token_threshold: 100_000, alert_enabled: true }

      expect_success
      expect(json_data[:costThresholdCents]).to eq(500)
      expect(json_data[:tokenThreshold]).to eq(100_000)
      expect(json_data[:alertEnabled]).to be true
      expect(organization.retention_policy.reload.cost_threshold_cents).to eq(500)
    end

    it 'creates alert.update audit log when alert thresholds change' do
      expect {
        authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                            user: user,
                            params: { cost_threshold_cents: 500, alert_enabled: true }
      }.to change(OrganizationAuditLog, :count).by(1)

      expect(OrganizationAuditLog.last.action).to eq('alert.update')
    end

    it 'creates retention.update audit log when retention TTLs change' do
      expect {
        authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                            user: user,
                            params: { tool_events_retention: '180_days' }
      }.to change(OrganizationAuditLog, :count).by(1)

      expect(OrganizationAuditLog.last.action).to eq('retention.update')
    end

    it 'allows clearing alert thresholds to nil' do
      organization.retention_policy.update!(cost_threshold_cents: 500)

      authenticated_patch "/api/v1/organizations/#{organization.id}/retention_policy",
                          user: user,
                          params: { cost_threshold_cents: nil }

      expect_success
      expect(json_data[:costThresholdCents]).to be_nil
    end
  end

  describe 'GET /api/v1/organizations/:id/retention_preview' do
    it 'returns cutoff_date and estimated_records for org owner' do
      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: user

      expect_success
      expect(json_data).to have_key(:cutoffDate)
      expect(json_data).to have_key(:estimatedRecords)
    end

    it 'returns cutoff_date as ISO 8601 date string when retention is not forever' do
      organization.retention_policy.update!(tool_events_retention: '90_days')

      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: user

      expect_success
      expect(json_data[:cutoffDate]).to match(/\A\d{4}-\d{2}-\d{2}\z/)
    end

    it 'returns null cutoff_date when retention policy is forever' do
      organization.retention_policy.update!(
        tool_events_retention: '30_days',
        daily_aggregate_retention: 'forever'
      )
      # Stub RetentionService to simulate "forever" for tool_events_retention
      allow(RetentionService).to receive(:retention_cutoff).and_return(nil)

      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: user

      expect_success
      expect(json_data[:cutoffDate]).to be_nil
      expect(json_data[:estimatedRecords]).to be_nil
    end

    it 'returns 403 for org member (non-owner)' do
      member = create(:user)
      create(:organization_membership, user: member, organization: organization, role: 'member')

      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: member

      expect_forbidden
    end

    it 'returns 404 for users not in the organization (organization not visible via authorized_scope)' do
      outsider = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: outsider

      expect_not_found
    end

    it 'returns estimated_records as nil when COUNT query times out' do
      allow(Timeout).to receive(:timeout).and_raise(Timeout::Error)

      authenticated_get "/api/v1/organizations/#{organization.id}/retention_preview", user: user

      expect_success
      expect(json_data[:estimatedRecords]).to be_nil
    end
  end
end
