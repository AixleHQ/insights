# frozen_string_literal: true

require "rails_helper"

RSpec.describe OrganizationProviderSetting, type: :model do
  describe "associations" do
    it { is_expected.to belong_to(:organization) }
  end

  describe "validations" do
    subject { build(:organization_provider_setting) }

    it { is_expected.to validate_presence_of(:provider) }
    it { is_expected.to validate_inclusion_of(:provider).in_array(OrganizationProviderSetting::KNOWN_PROVIDERS) }
    it { is_expected.to validate_uniqueness_of(:provider).scoped_to(:organization_id) }
    it { is_expected.to validate_inclusion_of(:enabled).in_array([ true, false ]) }
  end

  describe "KNOWN_PROVIDERS" do
    it "includes all expected integrations" do
      expect(OrganizationProviderSetting::KNOWN_PROVIDERS).to include(
        "github", "anthropic", "openai", "slack", "figma", "claude"
      )
    end
  end
end
