# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Seed credential hygiene (AC2, AIX-371)" do
  let(:source) { Rails.root.join("db/seeds.rb").read }

  it "assigns the unambiguously synthetic GitHub connector placeholder" do
    expect(source).to include(
      "c.access_token = 'DEVELOPMENT_PLACEHOLDER_NOT_A_REAL_TOKEN'"
    )
  end

  it "never assigns a literal that looks like a real GitHub PAT" do
    assigned_literals = source.scan(
      /\b(?:access_token|api_key|secret)\s*=\s*["']([^"']+)["']/
    ).flatten

    github_token = /\A(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\z/
    expect(assigned_literals).not_to include(a_string_matching(github_token))
  end
end
