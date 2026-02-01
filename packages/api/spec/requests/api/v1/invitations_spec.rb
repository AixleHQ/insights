# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Invitations', type: :request do
  let(:owner) { create(:user) }
  let(:admin) { create(:user) }
  let(:member) { create(:user) }
  let(:organization) { create(:organization) }
  let!(:owner_membership) { create(:organization_membership, user: owner, organization: organization, role: 'owner') }
  let!(:admin_membership) { create(:organization_membership, user: admin, organization: organization, role: 'admin') }
  let!(:member_membership) { create(:organization_membership, user: member, organization: organization, role: 'member') }

  describe 'GET /api/v1/organizations/:organization_id/invitations' do
    let!(:invitation1) { create(:invitation, organization: organization, invited_by: admin) }
    let!(:invitation2) { create(:invitation, organization: organization, invited_by: admin, status: 'accepted') }

    it 'returns all invitations for admins' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data.length).to eq(2)
    end

    it 'filters by status' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations",
                        user: admin,
                        organization: organization,
                        params: { status: 'pending' }

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:status]).to eq('pending')
    end

    it 'returns 403 for non-admins' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations",
                        user: member,
                        organization: organization

      expect_forbidden
    end

    it 'requires organization context' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations", user: admin

      expect_bad_request
    end
  end

  describe 'GET /api/v1/organizations/:organization_id/invitations/:id' do
    let!(:invitation) { create(:invitation, organization: organization, invited_by: admin) }

    it 'returns the invitation for admins' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}",
                        user: admin,
                        organization: organization

      expect_success
      expect(json_data[:id]).to eq(invitation.id)
      expect(json_data[:email]).to eq(invitation.email)
    end

    it 'returns 403 for non-admins' do
      authenticated_get "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}",
                        user: member,
                        organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/invitations' do
    let(:new_email) { 'newuser@example.com' }

    it 'creates an invitation as admin' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                           user: admin,
                           organization: organization,
                           params: { email: new_email, role: 'member' }
      }.to change(Invitation, :count).by(1)

      expect_created
      expect(json_data[:email]).to eq(new_email)
      expect(json_data[:role]).to eq('member')
      expect(json_data[:status]).to eq('pending')
    end

    it 'creates an invitation as owner' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                           user: owner,
                           organization: organization,
                           params: { email: new_email, role: 'admin' }
      }.to change(Invitation, :count).by(1)

      expect_created
      expect(json_data[:role]).to eq('admin')
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                         user: member,
                         organization: organization,
                         params: { email: new_email, role: 'member' }

      expect_forbidden
    end

    it 'returns error when inviting existing member' do
      existing_member = create(:user)
      create(:organization_membership, user: existing_member, organization: organization)

      authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                         user: admin,
                         organization: organization,
                         params: { email: existing_member.email, role: 'member' }

      expect_unprocessable
      expect(json_errors[:email]).to include('is already a member of this organization')
    end

    it 'returns error for duplicate pending invitation' do
      create(:invitation, organization: organization, email: new_email, invited_by: admin)

      authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                         user: admin,
                         organization: organization,
                         params: { email: new_email, role: 'member' }

      expect_unprocessable
      expect(json_errors[:email].first).to include('has already been invited to this organization')
    end

    it 'sends invitation email' do
      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/invitations",
                           user: admin,
                           organization: organization,
                           params: { email: new_email, role: 'member' }
      }.to have_enqueued_mail(InvitationMailer, :invite)
    end
  end

  describe 'DELETE /api/v1/organizations/:organization_id/invitations/:id' do
    let!(:invitation) { create(:invitation, organization: organization, invited_by: admin) }

    it 'revokes pending invitation as admin' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}",
                           user: admin,
                           organization: organization

      expect_no_content
      expect(invitation.reload.status).to eq('revoked')
    end

    it 'returns 403 for non-admins' do
      authenticated_delete "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}",
                           user: member,
                           organization: organization

      expect_forbidden
    end

    it 'returns error for already accepted invitation' do
      invitation.update!(status: 'accepted')

      authenticated_delete "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}",
                           user: admin,
                           organization: organization

      expect_forbidden
    end
  end

  describe 'POST /api/v1/organizations/:organization_id/invitations/:id/resend' do
    let!(:invitation) { create(:invitation, organization: organization, invited_by: admin, expires_at: 1.day.from_now) }

    it 'resends invitation email and updates expiration' do
      original_expiry = invitation.expires_at

      expect {
        authenticated_post "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}/resend",
                           user: admin,
                           organization: organization
      }.to have_enqueued_mail(InvitationMailer, :invite)

      expect_success
      expect(invitation.reload.expires_at).to be > original_expiry
    end

    it 'returns 403 for non-admins' do
      authenticated_post "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}/resend",
                         user: member,
                         organization: organization

      expect_forbidden
    end

    it 'returns error for non-pending invitation' do
      invitation.update!(status: 'accepted')

      authenticated_post "/api/v1/organizations/#{organization.id}/invitations/#{invitation.id}/resend",
                         user: admin,
                         organization: organization

      # Policy denies resend for non-pending invitations
      expect_forbidden
    end
  end
end

RSpec.describe 'Api::V1::PublicInvitations', type: :request do
  let(:organization) { create(:organization) }
  let(:inviter) { create(:user) }
  let!(:owner_membership) { create(:organization_membership, user: inviter, organization: organization, role: 'owner') }

  describe 'GET /api/v1/invitations/:token' do
    let!(:invitation) { create(:invitation, organization: organization, invited_by: inviter) }

    it 'returns invitation details without authentication' do
      get "/api/v1/invitations/#{invitation.token}"

      expect_success
      expect(json_data[:organization][:name]).to eq(organization.name)
      expect(json_data[:role]).to eq(invitation.role)
      expect(json_data[:invitedByName]).to eq(inviter.display_name)
    end

    it 'does not expose email in public response' do
      get "/api/v1/invitations/#{invitation.token}"

      expect_success
      expect(json_data).not_to have_key(:email)
    end

    it 'returns 404 for invalid token' do
      get '/api/v1/invitations/invalid-token'

      expect_not_found
    end

    it 'indicates if invitation is expired' do
      invitation.update!(expires_at: 1.day.ago)

      get "/api/v1/invitations/#{invitation.token}"

      expect_success
      expect(json_data[:expired]).to be true
    end
  end

  describe 'POST /api/v1/invitations/:token/accept' do
    let!(:invitation) { create(:invitation, organization: organization, invited_by: inviter, role: 'member') }
    let(:accepting_user) { create(:user, email: invitation.email) }

    it 'accepts invitation and creates membership' do
      authenticated_post "/api/v1/invitations/#{invitation.token}/accept",
                         user: accepting_user

      expect_success
      expect(json_response[:message]).to eq('Invitation accepted successfully')
      expect(json_response[:data][:organization][:name]).to eq(organization.name)
      expect(json_response[:data][:role]).to eq('member')

      expect(invitation.reload.status).to eq('accepted')
      expect(accepting_user.organizations).to include(organization)
    end

    it 'assigns the correct role' do
      admin_invitation = create(:invitation, :admin, organization: organization, invited_by: inviter)
      admin_user = create(:user, email: admin_invitation.email)

      authenticated_post "/api/v1/invitations/#{admin_invitation.token}/accept",
                         user: admin_user

      expect_success
      membership = admin_user.organization_memberships.find_by(organization: organization)
      expect(membership.role).to eq('admin')
    end

    it 'requires authentication' do
      post "/api/v1/invitations/#{invitation.token}/accept"

      expect_unauthorized
    end

    it 'returns error for revoked invitation' do
      invitation.update!(status: 'revoked')

      authenticated_post "/api/v1/invitations/#{invitation.token}/accept",
                         user: accepting_user

      expect_unprocessable
      expect(json_response[:message]).to include('revoked')
    end

    it 'returns error for expired invitation' do
      invitation.update!(expires_at: 1.day.ago)

      authenticated_post "/api/v1/invitations/#{invitation.token}/accept",
                         user: accepting_user

      expect_unprocessable
      expect(json_response[:message]).to include('expired')
    end

    it 'returns error if user is already a member' do
      create(:organization_membership, user: accepting_user, organization: organization)

      authenticated_post "/api/v1/invitations/#{invitation.token}/accept",
                         user: accepting_user

      expect_unprocessable
      expect(json_response[:message]).to include('already a member')
    end
  end

  describe 'GET /api/v1/invitations/check' do
    let(:user) { create(:user, email: 'testuser@example.com') }
    let!(:pending_invitation) { create(:invitation, organization: organization, invited_by: inviter, email: user.email) }
    let!(:other_invitation) { create(:invitation, organization: organization, invited_by: inviter) }

    it 'returns pending invitations for current user email' do
      authenticated_get '/api/v1/invitations/check', user: user

      expect_success
      expect(json_data.length).to eq(1)
      expect(json_data.first[:organization][:name]).to eq(organization.name)
    end

    it 'does not include expired invitations' do
      pending_invitation.update!(expires_at: 1.day.ago)

      authenticated_get '/api/v1/invitations/check', user: user

      expect_success
      expect(json_data).to be_empty
    end

    it 'requires authentication' do
      get '/api/v1/invitations/check'

      expect_unauthorized
    end
  end
end
