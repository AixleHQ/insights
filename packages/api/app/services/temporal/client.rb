# frozen_string_literal: true

require "temporalio/client"

module Temporal
  class Client
    # Must match the workflow name registered on the Temporal worker (see ingestion_worker.rb).
    INGESTION_SANITIZATION_WORKFLOW = "IngestionSanitizationWorkflow"

    class << self
      def start_workflow(workflow_class, workflow_id:, args: nil, task_queue: nil, execution_timeout: nil)
        opts = {
          id: workflow_id,
          task_queue: task_queue || default_task_queue
        }
        opts[:execution_timeout] = execution_timeout if execution_timeout

        client.start_workflow(
          workflow_class,
          args,
          **opts
        )
      end

      def execute_workflow(workflow_class, workflow_id:, args: nil, task_queue: nil)
        client.execute_workflow(
          workflow_class,
          args,
          id: workflow_id,
          task_queue: task_queue || default_task_queue
        )
      end

      def get_workflow_handle(workflow_id, run_id: nil)
        client.workflow_handle(workflow_id, run_id: run_id)
      end

      def query_workflow(workflow_id, query_name, run_id: nil)
        handle = get_workflow_handle(workflow_id, run_id: run_id)
        handle.query(query_name)
      end

      def signal_workflow(workflow_id, signal_name, args: nil, run_id: nil)
        handle = get_workflow_handle(workflow_id, run_id: run_id)
        handle.signal(signal_name, args)
      end

      def cancel_workflow(workflow_id, run_id: nil)
        handle = get_workflow_handle(workflow_id, run_id: run_id)
        handle.cancel
      end

      def terminate_workflow(workflow_id, reason: nil, run_id: nil)
        handle = get_workflow_handle(workflow_id, run_id: run_id)
        handle.terminate(reason)
      end

      def connected?
        client.present?
      rescue StandardError
        false
      end

      def workers_polling?(task_queue = nil)
        queue = task_queue || default_task_queue
        cache_key = "temporal_pollers_#{queue}"

        cached = Rails.cache.read(cache_key)
        return cached unless cached.nil?

        polling = begin
          request = Temporalio::Api::WorkflowService::V1::DescribeTaskQueueRequest.new(
            namespace: namespace,
            task_queue: Temporalio::Api::TaskQueue::V1::TaskQueue.new(name: queue)
          )
          response = client.connection.workflow_service.describe_task_queue(request)
          response.pollers.any?
        rescue StandardError => e
          Rails.logger.warn("[Temporal] workers_polling? check failed: #{e.class} — #{e.message}")
          false
        end

        Rails.cache.write(cache_key, polling, expires_in: polling ? 5.seconds : 1.second)
        polling
      end

      def reset!
        @client = nil
      end

      private

      def client
        @client ||= build_client
      end

      def build_client
        Temporalio::Client.connect(
          host,
          namespace
        )
      end

      def host
        ENV.fetch("TEMPORAL_HOST", "localhost:7233")
      end

      def namespace
        ENV.fetch("TEMPORAL_NAMESPACE", "default")
      end

      def default_task_queue
        ENV.fetch("TEMPORAL_TASK_QUEUE", "db90-tasks")
      end
    end
  end
end
