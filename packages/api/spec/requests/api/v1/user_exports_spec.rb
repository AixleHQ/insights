# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::UserExports", type: :request do
  let(:user)       { create(:user) }
  let(:other_user) { create(:user) }
  let(:org)        { create(:organization) }

  let!(:my_event) do
    create(:tool_event, user: user, organization: org,
           tool_name: "cursor", cost_usd: 0.05, tokens_in: 300, tokens_out: 700,
           occurred_at: 3.days.ago)
  end

  let!(:other_event) do
    create(:tool_event, user: other_user, organization: org,
           tool_name: "claude_code", cost_usd: 99.0, tokens_in: 5000, tokens_out: 10000,
           occurred_at: 3.days.ago)
  end

  describe "GET /api/v1/users/me/exports" do
    context "when unauthenticated" do
      it "returns 401" do
        get "/api/v1/users/me/exports", params: { report_type: "my_events", format: "json" }
        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "with valid params" do
      let(:default_params) do
        {
          report_type: "my_events",
          format: "json",
          from: 30.days.ago.iso8601,
          to: Time.current.iso8601
        }
      end

      it "returns 200" do
        authenticated_get "/api/v1/users/me/exports", user: user, params: default_params
        expect(response).to have_http_status(:ok)
      end

      it "returns only the requesting user's data (cross-user isolation)" do
        authenticated_get "/api/v1/users/me/exports", user: user, params: default_params
        expect(response).to have_http_status(:ok)
        data = JSON.parse(response.body).dig("data")
        # other_user's event must not appear
        tool_names = data.map { |row| row["tool_name"] }
        expect(tool_names).to all(eq("cursor"))
        expect(tool_names).not_to include("claude_code")
      end

      it "does NOT expose another user's events when requested by other_user" do
        authenticated_get "/api/v1/users/me/exports", user: other_user,
                          params: default_params.merge(report_type: "my_events")
        data = JSON.parse(response.body).dig("data")
        tool_names = data.map { |row| row["tool_name"] }
        expect(tool_names).to all(eq("claude_code"))
        expect(tool_names).not_to include("cursor")
      end

      describe "report types" do
        %w[my_cost_by_tool my_token_by_tool my_cost_by_project my_events].each do |report_type|
          it "returns 200 for report_type=#{report_type} with JSON" do
            authenticated_get "/api/v1/users/me/exports", user: user,
                              params: {
                                report_type: report_type,
                                format: "json",
                                from: 30.days.ago.iso8601,
                                to: Time.current.iso8601
                              }
            expect(response).to have_http_status(:ok)
            expect(JSON.parse(response.body)).to have_key("data")
          end

          it "returns CSV download for report_type=#{report_type} with format=csv" do
            authenticated_get "/api/v1/users/me/exports", user: user,
                              params: {
                                report_type: report_type,
                                format: "csv",
                                from: 30.days.ago.iso8601,
                                to: Time.current.iso8601
                              }
            expect(response).to have_http_status(:ok)
            expect(response.content_type).to include("text/csv")
            expect(response.headers["Content-Disposition"]).to include("attachment")
          end
        end
      end

      it "returns my_cost_by_tool with correct columns" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "my_cost_by_tool", format: "json",
                                    from: 30.days.ago.iso8601, to: Time.current.iso8601 }
        data = JSON.parse(response.body).dig("data")
        row  = data.first
        expect(row.keys).to match_array(%w[tool_name total_cost_usd total_tokens event_count])
        expect(row["tool_name"]).to eq("cursor")
        expect(row["total_cost_usd"]).to be_a(Numeric)
      end

      it "returns my_token_by_tool with correct columns" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "my_token_by_tool", format: "json",
                                    from: 30.days.ago.iso8601, to: Time.current.iso8601 }
        data = JSON.parse(response.body).dig("data")
        row  = data.first
        expect(row.keys).to match_array(%w[tool_name input_tokens output_tokens total_tokens])
        expect(row["total_tokens"]).to eq(my_event.tokens_in + my_event.tokens_out)
      end

      it "returns my_events rows with correct columns" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "my_events", format: "json",
                                    from: 30.days.ago.iso8601, to: Time.current.iso8601 }
        data = JSON.parse(response.body).dig("data")
        row  = data.first
        expect(row.keys).to match_array(
          %w[occurred_at tool_name event_type tokens_in tokens_out cost_usd project_name]
        )
      end

      it "defaults to last 30 days when from/to are omitted" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "my_events", format: "json" }
        expect(response).to have_http_status(:ok)
      end
    end

    context "with invalid params" do
      it "returns 422 for unknown report_type" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "bad_type", format: "json" }
        expect(response).to have_http_status(:unprocessable_content)
        expect(JSON.parse(response.body)["error"]).to eq("Unprocessable Entity")
      end

      it "returns 422 for unknown format" do
        authenticated_get "/api/v1/users/me/exports", user: user,
                          params: { report_type: "my_events", format: "xml" }
        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end
end
