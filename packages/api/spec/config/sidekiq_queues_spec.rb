# frozen_string_literal: true

require 'rails_helper'

# AIX-468: invitation emails silently disappeared in production because
# ActionMailer's deliver_later enqueues onto the "mailers" queue, but Sidekiq
# was started with an explicit queue list (config/sidekiq.yml) that omitted it.
# With an explicit list Sidekiq only drains the listed queues, so mail jobs
# piled up in Redis forever. These specs lock the two halves together.
RSpec.describe 'Sidekiq queue configuration' do
  let(:sidekiq_config) { YAML.load_file(Rails.root.join('config/sidekiq.yml')) }
  let(:queue_names) { sidekiq_config.fetch(:queues).map(&:first) }

  it 'processes the "mailers" queue' do
    expect(queue_names).to include('mailers')
  end

  it 'processes the queue ActionMailer delivers to' do
    expect(queue_names).to include(ApplicationMailer.deliver_later_queue_name)
  end
end
