#!/usr/bin/env ruby
require "bundler/setup"
require "temporalio/client"
require "temporalio/worker"
require "socket"

Dir[File.join(__dir__, "../workflows/**/*.rb")].each { |f| require f }
Dir[File.join(__dir__, "../activities/**/*.rb")].each { |f| require f }

TEMPORAL_HOST = ENV.fetch("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_NAMESPACE = ENV.fetch("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = ENV.fetch("TEMPORAL_TASK_QUEUE", "db90-tasks")
HEALTH_PORT = ENV.fetch("WORKER_HEALTH_PORT", "7234").to_i

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

health_thread = Thread.new do
  server = TCPServer.new("0.0.0.0", HEALTH_PORT)
  puts "Health check listening on :#{HEALTH_PORT}"
  loop do
    conn = server.accept
    request = conn.gets
    if request&.include?("/health")
      conn.print "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nok"
    else
      conn.print "HTTP/1.1 404 Not Found\r\n\r\n"
    end
    conn.close
  rescue => e
    puts "Health check error: #{e.message}"
    retry
  end
end

puts "Worker started. Listening for tasks..."
worker.run(shutdown_signals: %w[INT TERM])

puts "Worker stopped."
health_thread.kill
