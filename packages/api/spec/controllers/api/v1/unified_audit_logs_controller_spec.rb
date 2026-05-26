# frozen_string_literal: true

require "rails_helper"

RSpec.describe Api::V1::UnifiedAuditLogsController do
  describe "constant resolution (Api::V1 namespace)" do
    # Regression for a production bug: without leading ::, Ruby/Zeitwerk looked up
    # Api::V1::UnifiedAuditLogQueryBuilder when the controller loaded first, JwtAuth
    # rescued the NameError, and clients saw 401 { message: "Authentication failed" }.

    it "does not define a nested UnifiedAuditLogQueryBuilder constant" do
      expect(described_class).not_to be_const_defined(:UnifiedAuditLogQueryBuilder, false)
    end

    it "resolves VALID_SCOPES from the top-level query builder" do
      expect(described_class::VALID_SCOPES).to eq(::UnifiedAuditLogQueryBuilder::VALID_SCOPES)
      expect(described_class::VALID_SCOPES).to eq(%w[organization project admin])
    end

    it "uses absolute constant references in the controller source" do
      source = Rails.root.join("app/controllers/api/v1/unified_audit_logs_controller.rb").read

      expect(source).to match(/VALID_SCOPES\s+=\s+::UnifiedAuditLogQueryBuilder::VALID_SCOPES/)
      expect(source).to include("::UnifiedAuditLogQueryBuilder.new(")
      expect(source).to include("with: ::UnifiedAuditLogPolicy")
      expect(source).not_to match(/VALID_SCOPES\s*=\s*UnifiedAuditLogQueryBuilder::VALID_SCOPES/)
      expect(source).not_to match(/(?<!::)UnifiedAuditLogQueryBuilder\.new\(/)
    end
  end
end
