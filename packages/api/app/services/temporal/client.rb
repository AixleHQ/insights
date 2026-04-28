# frozen_string_literal: true

module Temporal
  class Client
    class << self
      def start_workflow(workflow_class, workflow_id:, args: nil, task_queue: nil)
        client.start_workflow(
          workflow_class,
          args,
          id: workflow_id,
          task_queue: task_queue || default_task_queue
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
        handle.terminate(reason: reason)
      end

      def connected?
        client.present?
      rescue StandardError
        false
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
