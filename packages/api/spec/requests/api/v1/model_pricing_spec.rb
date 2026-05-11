# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::ModelPricing', type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:outsider) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner, organization: organization, role: 'owner')
    create(:organization_membership, user: admin, organization: organization, role: 'owner')
    create(:organization_membership, user: member, organization: organization, role: 'member')
  end

  describe 'GET /api/v1/organizations/:id/model_pricing' do
    let(:path) { "/api/v1/organizations/#{organization.id}/model_pricing" }

    context 'as org owner' do
      it 'returns 200 with models and tools arrays' do
        authenticated_get path, user: owner

        expect_success
        expect(json_response).to have_key(:models)
        expect(json_response).to have_key(:tools)
      end

      it 'returns model entries with required fields' do
        authenticated_get path, user: owner

        expect_success
        entry = json_response[:models].first
        expect(entry).to include(:name, :input_per_mtok, :output_per_mtok)
        expect(entry[:name]).to be_a(String)
        expect(entry[:input_per_mtok]).to be_a(Numeric)
        expect(entry[:output_per_mtok]).to be_a(Numeric)
      end

      it 'returns tool entries with required fields' do
        authenticated_get path, user: owner

        expect_success
        entry = json_response[:tools].first
        expect(entry).to include(:name, :input_per_mtok, :output_per_mtok)
      end

      it 'matches ModelPricingService data' do
        authenticated_get path, user: owner

        expect_success
        expected_model_names = ModelPricingService.all_model_pricing.keys
        returned_model_names = json_response[:models].map { |e| e[:name] }
        expect(returned_model_names).to match_array(expected_model_names)

        expected_tool_names = ModelPricingService.all_tool_pricing.keys
        returned_tool_names = json_response[:tools].map { |e| e[:name] }
        expect(returned_tool_names).to match_array(expected_tool_names)
      end
    end

    context 'as org admin' do
      it 'returns 200' do
        authenticated_get path, user: admin

        expect_success
      end
    end

    context 'as org member (non-admin)' do
      it 'returns 403' do
        authenticated_get path, user: member

        expect_forbidden
      end
    end

    context 'as non-member' do
      it 'returns 403' do
        authenticated_get path, user: outsider

        expect_forbidden
      end
    end

    context 'unauthenticated' do
      it 'returns 401' do
        get path

        expect_unauthorized
      end
    end

    context 'when organization does not exist' do
      it 'returns 404' do
        authenticated_get "/api/v1/organizations/00000000-0000-0000-0000-000000000000/model_pricing",
          user: owner

        expect_not_found
      end
    end
  end
end
