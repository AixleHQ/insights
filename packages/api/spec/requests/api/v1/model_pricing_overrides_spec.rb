# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::ModelPricingOverrides', type: :request do
  let(:owner)   { create(:user) }
  let(:admin)   { create(:user) }
  let(:member)  { create(:user) }
  let(:outsider) { create(:user) }
  let(:organization) { create(:organization) }

  before do
    create(:organization_membership, user: owner,   organization: organization, role: 'owner')
    create(:organization_membership, user: admin,   organization: organization, role: 'owner')
    create(:organization_membership, user: member,  organization: organization, role: 'member')
  end

  let(:base_path) { "/api/v1/organizations/#{organization.id}/model_pricing/overrides" }

  # ── GET index ──────────────────────────────────────────────────────────────

  describe 'GET /api/v1/organizations/:organization_id/model_pricing/overrides' do
    let!(:override) { create(:model_pricing_override, organization: organization, model_pattern: 'gpt-4o-ft-acme') }

    context 'as org owner' do
      it 'returns 200 with overrides array' do
        authenticated_get base_path, user: owner, organization: organization

        expect_success
        expect(json_response).to have_key(:data)
        expect(json_response[:data].size).to eq(1)
      end

      it 'returns override with required fields' do
        authenticated_get base_path, user: owner, organization: organization

        expect_success
        entry = json_response[:data].first
        expect(entry).to include(:id, :modelPattern, :inputPerMtok, :outputPerMtok)
        expect(entry[:modelPattern]).to eq('gpt-4o-ft-acme')
        expect(entry[:inputPerMtok]).to be_a(Numeric)
        expect(entry[:outputPerMtok]).to be_a(Numeric)
      end
    end

    context 'as org admin' do
      it 'returns 200' do
        authenticated_get base_path, user: admin, organization: organization

        expect_success
      end
    end

    context 'as org member (non-admin)' do
      it 'returns 403' do
        authenticated_get base_path, user: member, organization: organization

        expect_forbidden
      end
    end

    context 'as non-member (no org context)' do
      it 'returns 400 without X-Organization-ID header' do
        authenticated_get base_path, user: outsider

        expect(response).to have_http_status(:bad_request)
      end
    end

    context 'unauthenticated' do
      it 'returns 401' do
        get base_path

        expect_unauthorized
      end
    end
  end

  # ── POST create ────────────────────────────────────────────────────────────

  describe 'POST /api/v1/organizations/:organization_id/model_pricing/overrides' do
    let(:valid_params) { { model_pattern: 'gpt-4o-ft-acme', input_per_mtok: 1.5, output_per_mtok: 6.0 } }

    context 'as org owner with valid params' do
      it 'returns 201 and creates the override' do
        expect {
          authenticated_post base_path, params: valid_params, user: owner, organization: organization
        }.to change { organization.model_pricing_overrides.count }.by(1)

        expect_created
        expect(json_response[:data][:modelPattern]).to eq('gpt-4o-ft-acme')
        expect(json_response[:data][:inputPerMtok]).to eq(1.5)
        expect(json_response[:data][:outputPerMtok]).to eq(6.0)
      end
    end

    context 'as org admin' do
      it 'returns 201' do
        authenticated_post base_path, params: valid_params, user: admin, organization: organization

        expect_created
      end
    end

    context 'with invalid params' do
      it 'returns 422 when model_pattern is blank' do
        authenticated_post base_path,
          params: { model_pattern: '', input_per_mtok: 1.5, output_per_mtok: 6.0 },
          user: owner, organization: organization

        expect_unprocessable
      end

      it 'returns 422 when input_per_mtok is not positive' do
        authenticated_post base_path,
          params: { model_pattern: 'test-model', input_per_mtok: 0, output_per_mtok: 6.0 },
          user: owner, organization: organization

        expect_unprocessable
      end

      it 'returns 422 when output_per_mtok is not positive' do
        authenticated_post base_path,
          params: { model_pattern: 'test-model', input_per_mtok: 1.5, output_per_mtok: -1 },
          user: owner, organization: organization

        expect_unprocessable
      end

      it 'returns 422 on duplicate model_pattern for the same org' do
        create(:model_pricing_override, organization: organization, model_pattern: 'gpt-4o-ft-acme')

        authenticated_post base_path, params: valid_params, user: owner, organization: organization

        expect_unprocessable
      end
    end

    context 'as org member (non-admin)' do
      it 'returns 403' do
        authenticated_post base_path, params: valid_params, user: member, organization: organization

        expect_forbidden
      end
    end
  end

  # ── PUT update ─────────────────────────────────────────────────────────────

  describe 'PUT /api/v1/organizations/:organization_id/model_pricing/overrides/:id' do
    let!(:override) { create(:model_pricing_override, organization: organization, model_pattern: 'gpt-4o-ft-acme') }
    let(:path)      { "#{base_path}/#{override.id}" }

    context 'as org owner' do
      it 'returns 200 and updates the override' do
        authenticated_put path, params: { input_per_mtok: 2.0, output_per_mtok: 8.0 },
                                user: owner, organization: organization

        expect_success
        expect(json_response[:data][:inputPerMtok]).to eq(2.0)
        expect(json_response[:data][:outputPerMtok]).to eq(8.0)
        expect(override.reload.input_per_mtok.to_f).to eq(2.0)
      end
    end

    context 'with invalid params' do
      it 'returns 422 when input_per_mtok is zero' do
        authenticated_put path, params: { input_per_mtok: 0 }, user: owner, organization: organization

        expect_unprocessable
      end
    end

    context 'when override belongs to another organization' do
      let(:other_org) { create(:organization) }
      let!(:other_override) { create(:model_pricing_override, organization: other_org) }

      it 'returns 404' do
        authenticated_put "#{base_path}/#{other_override.id}", params: { input_per_mtok: 2.0 },
                                                               user: owner, organization: organization

        expect_not_found
      end
    end

    context 'as org member (non-admin)' do
      it 'returns 403' do
        authenticated_put path, params: { input_per_mtok: 2.0, output_per_mtok: 8.0 },
                                user: member, organization: organization

        expect_forbidden
      end
    end
  end

  # ── DELETE destroy ─────────────────────────────────────────────────────────

  describe 'DELETE /api/v1/organizations/:organization_id/model_pricing/overrides/:id' do
    let!(:override) { create(:model_pricing_override, organization: organization, model_pattern: 'gpt-4o-ft-acme') }
    let(:path)      { "#{base_path}/#{override.id}" }

    context 'as org owner' do
      it 'returns 204 and removes the override' do
        expect {
          authenticated_delete path, user: owner, organization: organization
        }.to change { organization.model_pricing_overrides.count }.by(-1)

        expect_no_content
      end
    end

    context 'when override belongs to another organization' do
      let(:other_org) { create(:organization) }
      let!(:other_override) { create(:model_pricing_override, organization: other_org) }

      it 'returns 404' do
        authenticated_delete "#{base_path}/#{other_override.id}", user: owner, organization: organization

        expect_not_found
      end
    end

    context 'as org member (non-admin)' do
      it 'returns 403' do
        authenticated_delete path, user: member, organization: organization

        expect_forbidden
      end
    end
  end
end
