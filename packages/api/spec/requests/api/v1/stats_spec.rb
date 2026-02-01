# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Stats', type: :request do
  let(:user) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:membership) { create(:organization_membership, user: user, organization: organization, role: 'member') }

  before do
    # Create some tool events for stats
    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'claude_code',
           event_type: 'chat',
           tokens_in: 100,
           tokens_out: 500,
           cost_usd: 0.05,
           occurred_at: Time.current)

    create(:tool_event,
           organization: organization,
           user: user,
           tool_name: 'cursor',
           event_type: 'completion',
           tokens_in: 50,
           tokens_out: 200,
           cost_usd: 0.02,
           occurred_at: 1.hour.ago)
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/overview' do
    it 'returns overview statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: user,
                        organization: organization

      expect_success
      # Overview returns flat structure with snake_case keys
      expect(json_response[:total_events]).to be_a(Integer)
      expect(json_response[:total_cost_usd]).to be_a(Numeric)
      expect(json_response[:active_users]).to be_a(Integer)
      expect(json_response[:high_risk_events]).to be_a(Integer)
      expect(json_response[:events_change_percent]).to be_a(Numeric)
      expect(json_response[:cost_change_percent]).to be_a(Numeric)
    end

    it 'returns 403 for non-members' do
      non_member = create(:user)

      authenticated_get "/api/v1/organizations/#{organization.id}/stats/overview",
                        user: non_member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/hourly' do
    it 'returns hourly aggregated statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/hourly",
                        user: user,
                        organization: organization

      expect_success
      # Response is { data: { hourly: [...], timeRange: {...} } }
      expect(json_data[:hourly]).to be_an(Array)
      expect(json_data[:timeRange]).to have_key(:start)
      expect(json_data[:timeRange]).to have_key(:end)
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/stats/daily' do
    it 'returns daily aggregated statistics' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                        user: user,
                        organization: organization

      expect_success
      # Response is { data: [...], tool_breakdown: [...] }
      expect(json_response[:data]).to be_an(Array)
      expect(json_response[:tool_breakdown]).to be_an(Array)
    end

    it 'filters by date range' do
      authenticated_get "/api/v1/organizations/#{organization.id}/stats/daily",
                        user: user,
                        organization: organization,
                        params: {
                          start_date: 7.days.ago.iso8601,
                          end_date: Time.current.iso8601
                        }

      expect_success
    end
  end
end
