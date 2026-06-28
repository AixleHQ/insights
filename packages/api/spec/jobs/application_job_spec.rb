# frozen_string_literal: true

require "rails_helper"

RSpec.describe ApplicationJob do
  describe ".symbolized_job_options" do
    it "returns symbolized options from the third perform argument" do
      job = instance_double(ActiveJob::Base, arguments: [ "c1", "webhook", { "delivery_id" => "d1" } ])
      expect(described_class.symbolized_job_options(job)).to eq({ delivery_id: "d1" })
    end

    it "returns an empty hash when only two arguments (e.g. perform_later id, 'sync')" do
      job = instance_double(ActiveJob::Base, arguments: [ "c1", "sync" ])
      expect(described_class.symbolized_job_options(job)).to eq({})
    end
  end
end
