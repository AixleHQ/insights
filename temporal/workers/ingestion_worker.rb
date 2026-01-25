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
  workflows: [Workflows::HelloWorkflow],
  activities: [Activities::GreetingActivity.new]
)

puts "Worker started. Listening for tasks..."

# Handle graceful shutdown
shutdown = false
Signal.trap("INT") { shutdown = true }
Signal.trap("TERM") { shutdown = true }

worker.run do
  shutdown
end

puts "Worker stopped."
