#!/usr/bin/env ruby
require "bundler/setup"
require "temporalio/client"
require "temporalio/worker"

# Load workflows and activities
Dir[File.join(__dir__, "../workflows/**/*.rb")].each { |f| require f }
Dir[File.join(__dir__, "../activities/**/*.rb")].each { |f| require f }

TEMPORAL_HOST = ENV.fetch("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_NAMESPACE = ENV.fetch("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = ENV.fetch("TEMPORAL_TASK_QUEUE", "db90-tasks")

puts "Starting Temporal worker..."
puts "  Host: #{TEMPORAL_HOST}"
puts "  Namespace: #{TEMPORAL_NAMESPACE}"
puts "  Task Queue: #{TASK_QUEUE}"

client = Temporalio::Client.connect(TEMPORAL_HOST, TEMPORAL_NAMESPACE)

worker = Temporalio::Worker.new(
  client: client,
  task_queue: TASK_QUEUE,
  workflows: [
    Workflows::HelloWorkflow,
    Workflows::IngestionSanitizationWorkflow
  ],
  activities: [
    Activities::GreetingActivity.new,
    Activities::FetchRawEventActivity.new,
    Activities::GetPolicyActivity.new,
    Activities::ClassificationActivity.new,
    Activities::SanitizationActivity.new,
    Activities::PersistenceActivity.new,
    Activities::AlertActivity.new,
    Activities::BroadcastActivity.new
  ]
)

puts "Worker started. Listening for tasks..."

# Run worker with automatic signal handling
worker.run(shutdown_signals: %w[INT TERM])

puts "Worker stopped."
