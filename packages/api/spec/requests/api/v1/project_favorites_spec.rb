# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::ProjectFavorites", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization, owner: nil) }

  let!(:org_membership) { create(:organization_membership, user: user, organization: organization, role: "owner") }
  let!(:project_membership) { create(:project_membership, user: user, project: project, role: "member") }

  describe "POST /api/v1/projects/:id/favorite" do
    it "favorites a project" do
      authenticated_post "/api/v1/projects/#{project.id}/favorite", user: user

      expect_success
      expect(json_data[:favorited]).to be true
      expect(UserProjectFavorite.exists?(user: user, project: project)).to be true
    end

    it "is idempotent — does not create duplicates" do
      create(:user_project_favorite, user: user, project: project)

      authenticated_post "/api/v1/projects/#{project.id}/favorite", user: user

      expect_success
      expect(UserProjectFavorite.where(user: user, project: project).count).to eq(1)
    end

    it "returns 403 when user cannot see the project" do
      outsider = create(:user)
      authenticated_post "/api/v1/projects/#{project.id}/favorite", user: outsider

      expect_forbidden
    end
  end

  describe "DELETE /api/v1/projects/:id/favorite" do
    it "unfavorites a project" do
      create(:user_project_favorite, user: user, project: project)

      authenticated_delete "/api/v1/projects/#{project.id}/favorite", user: user

      expect_success
      expect(json_data[:favorited]).to be false
      expect(UserProjectFavorite.exists?(user: user, project: project)).to be false
    end

    it "is idempotent — no error when not favorited" do
      authenticated_delete "/api/v1/projects/#{project.id}/favorite", user: user

      expect_success
      expect(json_data[:favorited]).to be false
    end

    it "returns 403 when user cannot see the project" do
      outsider = create(:user)
      authenticated_delete "/api/v1/projects/#{project.id}/favorite", user: outsider

      expect_forbidden
    end
  end

  describe "GET /api/v1/users/me/favorites" do
    let(:other_project) { create(:project, organization: organization, owner: nil) }
    let!(:other_project_membership) { create(:project_membership, user: user, project: other_project, role: "member") }

    it "returns favorited projects" do
      create(:user_project_favorite, user: user, project: project)
      create(:user_project_favorite, user: user, project: other_project)

      authenticated_get "/api/v1/users/me/favorites", user: user

      expect_success
      ids = json_data.map { |p| p[:id] }
      expect(ids).to contain_exactly(project.id, other_project.id)
    end

    it "returns only the current user's favorites" do
      create(:user_project_favorite, user: user, project: project)
      create(:user_project_favorite, user: other_user, project: project)

      authenticated_get "/api/v1/users/me/favorites", user: user

      expect_success
      expect(json_data.length).to eq(1)
    end

    it "returns empty array when no favorites" do
      authenticated_get "/api/v1/users/me/favorites", user: user

      expect_success
      expect(json_data).to eq([])
    end

    it "includes id and name" do
      create(:user_project_favorite, user: user, project: project)

      authenticated_get "/api/v1/users/me/favorites", user: user

      expect_success
      expect(json_data.first[:id]).to eq(project.id)
      expect(json_data.first[:name]).to eq(project.name)
    end

    it "excludes favorites for projects the user no longer has access to" do
      # Use a member-role user: only sees projects they have an explicit membership for
      member = create(:user)
      create(:organization_membership, user: member, organization: organization, role: "member")
      create(:project_membership, user: member, project: project, role: "member")

      revoked_project = create(:project, organization: organization, owner: nil)
      # member favorited revoked_project while they still had access, then was removed
      create(:user_project_favorite, user: member, project: revoked_project)
      create(:user_project_favorite, user: member, project: project)

      authenticated_get "/api/v1/users/me/favorites", user: member

      expect_success
      ids = json_data.map { |p| p[:id] }
      expect(ids).to include(project.id)
      expect(ids).not_to include(revoked_project.id)
    end
  end
end
