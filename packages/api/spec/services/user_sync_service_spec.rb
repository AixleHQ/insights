require 'rails_helper'

RSpec.describe UserSyncService do
  describe '.sync_from_claims' do
    let(:claims) do
      {
        'sub' => 'keycloak-user-123',
        'email' => 'test@example.com',
        'name' => 'Test User',
        'picture' => 'https://example.com/avatar.png',
        'iat' => Time.current.to_i  # Token issued at (for fresh login detection)
      }
    end

    context 'when user does not exist' do
      it 'creates a new user' do
        expect {
          described_class.sync_from_claims(claims)
        }.to change(User, :count).by(1)
      end

      it 'sets all attributes from claims' do
        user = described_class.sync_from_claims(claims)

        expect(user.keycloak_sub).to eq('keycloak-user-123')
        expect(user.email).to eq('test@example.com')
        expect(user.name).to eq('Test User')
        expect(user.avatar_url).to eq('https://example.com/avatar.png')
      end

      it 'sets last_login_at for fresh login' do
        freeze_time do
          user = described_class.sync_from_claims(claims)
          expect(user.last_login_at).to eq(Time.current)
        end
      end

      it 'sets last_login_at when iat is within 2 minutes' do
        claims_with_recent_iat = claims.merge('iat' => 1.minute.ago.to_i)
        freeze_time do
          user = described_class.sync_from_claims(claims_with_recent_iat)
          expect(user.last_login_at).to eq(Time.current)
        end
      end

      it 'sets last_sign_in_at on first login' do
        freeze_time do
          user = described_class.sync_from_claims(claims)
          expect(user.last_sign_in_at).to eq(Time.current)
        end
      end

      it 'sets last_sign_in_at on first sync even without iat claim' do
        claims_without_iat = claims.except('iat')
        freeze_time do
          user = described_class.sync_from_claims(claims_without_iat)
          expect(user.last_sign_in_at).to eq(Time.current)
        end
      end
    end

    context 'when user already exists' do
      let!(:existing_user) do
        create(:user,
          keycloak_sub: 'keycloak-user-123',
          email: 'old@example.com',
          name: 'Old Name'
        )
      end

      it 'does not create a new user' do
        expect {
          described_class.sync_from_claims(claims)
        }.not_to change(User, :count)
      end

      it 'updates non-editable attributes from claims' do
        user = described_class.sync_from_claims(claims)

        expect(user.id).to eq(existing_user.id)
        expect(user.email).to eq('test@example.com')
      end

      it 'does not overwrite user-editable attributes (name, avatar_url)' do
        original_avatar = existing_user.avatar_url
        user = described_class.sync_from_claims(claims)

        expect(user.name).to eq('Old Name')
        expect(user.avatar_url).to eq(original_avatar)
      end

      it 'updates last_login_at for fresh login' do
        freeze_time do
          user = described_class.sync_from_claims(claims)
          expect(user.last_login_at).to eq(Time.current)
        end
      end

      it 'updates last_sign_in_at for fresh login' do
        freeze_time do
          user = described_class.sync_from_claims(claims)
          expect(user.last_sign_in_at).to eq(Time.current)
        end
      end

      it 'does not update last_sign_in_at for old token' do
        existing_user.update!(last_sign_in_at: 1.hour.ago)
        old_token_claims = claims.merge('iat' => 3.minutes.ago.to_i)

        user = described_class.sync_from_claims(old_token_claims)

        expect(user.last_sign_in_at).to be_within(1.second).of(1.hour.ago)
      end

      it 'does not update last_login_at for old token if recently logged in' do
        existing_user.update!(last_login_at: 30.minutes.ago)
        old_token_claims = claims.merge('iat' => 1.hour.ago.to_i)

        user = described_class.sync_from_claims(old_token_claims)
        # Should not update since iat is old and last_login was within 1 hour
        expect(user.last_login_at).to be_within(1.second).of(30.minutes.ago)
      end

      it 'updates last_login_at for old token if last login was over 1 hour ago' do
        existing_user.update!(last_login_at: 2.hours.ago)
        old_token_claims = claims.merge('iat' => 1.hour.ago.to_i)

        freeze_time do
          user = described_class.sync_from_claims(old_token_claims)
          # Should update since last_login was over 1 hour ago
          expect(user.last_login_at).to eq(Time.current)
        end
      end
    end

    context 'when claims are missing required fields' do
      it 'raises error when sub is missing' do
        claims_without_sub = claims.except('sub')

        expect {
          described_class.sync_from_claims(claims_without_sub)
        }.to raise_error(ArgumentError, 'Missing sub claim')
      end
    end

    context 'with auto-assign organization' do
      let(:claims_acme) do
        {
          'sub' => 'keycloak-acme-user',
          'email' => 'user@example.com',
          'name' => 'Acme User'
        }
      end

      # Must match DOMAIN_ORG_MAPPING: 'example.com' => 'acme-corp'
      let!(:acme_org) { create(:organization, slug: 'acme-corp', name: 'Acme Corp') }

      it 'auto-assigns user to organization based on email domain' do
        user = described_class.sync_from_claims(claims_acme)

        expect(user.organizations).to include(acme_org)
      end

      it 'creates membership with member role' do
        user = described_class.sync_from_claims(claims_acme)

        membership = user.organization_memberships.find_by(organization: acme_org)
        expect(membership.role).to eq('member')
      end

      it 'does not create duplicate memberships' do
        # First sync
        user = described_class.sync_from_claims(claims_acme)

        # Second sync
        expect {
          described_class.sync_from_claims(claims_acme)
        }.not_to change(OrganizationMembership, :count)
      end
    end

    context 'with auto-assign project' do
      let(:claims_project) do
        {
          'sub' => 'keycloak-project-user',
          'email' => 'developer@projectdomain.com',
          'name' => 'Project User'
        }
      end

      let!(:project) { create(:project) }
      let!(:project_setting) do
        create(:project_setting, project: project, key: 'allowed_email_domain', value: 'projectdomain.com')
      end
      # User must be a member of the project's org for auto-assign to apply
      let!(:org_setting) do
        create(:organization_setting, organization: project.organization, key: 'allowed_email_domain', value: 'projectdomain.com')
      end

      it 'auto-assigns user to project based on email domain' do
        user = described_class.sync_from_claims(claims_project)

        expect(user.projects).to include(project)
      end

      it 'creates membership with member role' do
        user = described_class.sync_from_claims(claims_project)

        membership = user.project_memberships.find_by(project: project)
        expect(membership.role).to eq('member')
      end

      it 'does not create duplicate memberships' do
        user = described_class.sync_from_claims(claims_project)

        expect {
          described_class.sync_from_claims(claims_project)
        }.not_to change(ProjectMembership, :count)
      end

      it 'handles no matching domain gracefully' do
        claims_no_match = claims_project.merge('email' => 'user@otherdomain.com')

        user = described_class.sync_from_claims(claims_no_match)
        expect(user.project_memberships).to be_empty
      end

      it 'does not assign user to a project in an org they do not belong to' do
        other_org_project = create(:project)
        create(:project_setting, project: other_org_project, key: 'allowed_email_domain', value: 'projectdomain.com')

        user = described_class.sync_from_claims(claims_project)

        expect(user.projects).not_to include(other_org_project)
      end
    end

    context 'when organization for domain does not exist' do
      let(:claims_unknown) do
        {
          'sub' => 'keycloak-unknown-user',
          'email' => 'user@unknowndomain.com',
          'name' => 'Unknown User'
        }
      end

      it 'does not raise error' do
        expect {
          described_class.sync_from_claims(claims_unknown)
        }.not_to raise_error
      end

      it 'creates user without organization membership' do
        user = described_class.sync_from_claims(claims_unknown)
        expect(user.organizations).to be_empty
      end
    end
  end

  describe '.find_or_create_from_token' do
    let(:claims) do
      {
        'sub' => 'token-user-123',
        'email' => 'token@example.com',
        'name' => 'Token User'
      }
    end

    it 'delegates to sync_from_claims' do
      expect(described_class).to receive(:sync_from_claims).with(claims).and_call_original

      described_class.find_or_create_from_token(claims)
    end
  end
end
