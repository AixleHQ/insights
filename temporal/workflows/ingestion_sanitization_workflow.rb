require "temporalio/workflow"
require_relative "../activities/persist_prompt_activity"

module Workflows
  class IngestionSanitizationWorkflow < Temporalio::Workflow::Definition
    workflow_query_attr_reader :current_state
    workflow_query_attr_reader :classification_result
    workflow_query_attr_reader :sanitization_result

    # Workflow input structure:
    # {
    #   "raw_event_key" => "events/2024/01/25/abc123.json",
    #   "raw_event_bucket" => "raw-events",
    #   "event" => {
    #     "organization_id" => "uuid",
    #     "user_id" => "uuid or nil",
    #     "project_id" => "uuid or nil",
    #     "tool_name" => "claude_code",
    #     "event_type" => "chat",
    #     "model" => "claude-3-sonnet",
    #     "tokens_in" => 100,
    #     "tokens_out" => 500,
    #     "cost_usd" => 0.10,
    #     "duration_ms" => 1500,
    #     "occurred_at" => "2024-01-25T10:00:00Z"
    #   }
    # }

    def execute(params)
      @current_state = "starting"
      workflow_id = Temporalio::Workflow.info.workflow_id

      # Step 1: Fetch raw event from MinIO
      @current_state = "fetching_raw_event"
      raw_event = Temporalio::Workflow.execute_activity(
        Activities::FetchRawEventActivity,
        {
          "bucket" => params["raw_event_bucket"],
          "key" => params["raw_event_key"]
        },
        start_to_close_timeout: 30,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 1.0,
          backoff_coefficient: 2.0,
          max_attempts: 3
        )
      )

      # Step 2: Get sanitization policy for the organization
      @current_state = "getting_policy"
      policy = Temporalio::Workflow.execute_activity(
        Activities::GetPolicyActivity,
        { "organization_id" => params["event"]["organization_id"] },
        start_to_close_timeout: 10,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 1.0,
          backoff_coefficient: 2.0,
          max_attempts: 5
        )
      )

      # Step 3: Classify the content
      @current_state = "classifying"
      @classification_result = Temporalio::Workflow.execute_activity(
        Activities::ClassificationActivity,
        {
          "raw_payload" => raw_event["raw_payload"],
          "policy" => policy
        },
        start_to_close_timeout: 60,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 2.0,
          backoff_coefficient: 2.0,
          max_attempts: 5
        )
      )

      # Step 4: Sanitize if needed
      @current_state = "sanitizing"
      @sanitization_result = Temporalio::Workflow.execute_activity(
        Activities::SanitizationActivity,
        {
          "raw_payload" => raw_event["raw_payload"],
          "policy" => policy,
          "classification" => @classification_result
        },
        start_to_close_timeout: 60,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 2.0,
          backoff_coefficient: 2.0,
          max_attempts: 5
        )
      )

      # Step 5: Persist to database
      @current_state = "persisting"
      persistence_result = Temporalio::Workflow.execute_activity(
        Activities::PersistenceActivity,
        {
          "event" => params["event"],
          "raw_event_key" => params["raw_event_key"],
          "organization_id" => params["event"]["organization_id"],
          "classification" => @classification_result,
          "sanitization" => @sanitization_result,
          "workflow_id" => workflow_id
        },
        start_to_close_timeout: 30,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 1.0,
          backoff_coefficient: 2.0,
          max_attempts: 5
        )
      )

      # Step 5b: Persist sanitized prompt text (capture path only, non-blocking on failure)
      # Use canonical occurred_at from the persisted tool_event to keep idempotency across replay paths.
      @current_state = "persisting_prompt"
      begin
        Temporalio::Workflow.execute_activity(
          Activities::PersistPromptActivity,
          {
            "tool_event_id" => persistence_result["tool_event_id"],
            "occurred_at"   => persistence_result["occurred_at"],
            "sanitization"  => @sanitization_result,
            "policy"        => policy
          },
          start_to_close_timeout: 15,
          retry_policy: Temporalio::RetryPolicy.new(
            initial_interval: 1.0,
            backoff_coefficient: 2.0,
            max_attempts: 3
          )
        )
      rescue StandardError
        # Prompt capture must never fail the already-persisted event path.
      end

      # Step 6: Broadcast to ActionCable (non-blocking)
      @current_state = "broadcasting"
      broadcast_result = Temporalio::Workflow.execute_activity(
        Activities::BroadcastActivity,
        {
          "organization_id" => params["event"]["organization_id"],
          "tool_event_id" => persistence_result["tool_event_id"],
          "classification" => @classification_result
        },
        start_to_close_timeout: 10,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 1.0,
          backoff_coefficient: 2.0,
          max_attempts: 3
        )
      )

      # Step 7: Send alert if high risk
      @current_state = "alerting"
      alert_result = Temporalio::Workflow.execute_activity(
        Activities::AlertActivity,
        {
          "classification" => @classification_result,
          "event" => params["event"],
          "tool_event_id" => persistence_result["tool_event_id"]
        },
        start_to_close_timeout: 30,
        retry_policy: Temporalio::RetryPolicy.new(
          initial_interval: 1.0,
          backoff_coefficient: 2.0,
          max_attempts: 3
        )
      )

      @current_state = "completed"

      # Return summary
      {
        "workflow_id" => workflow_id,
        "tool_event_id" => persistence_result["tool_event_id"],
        "audit_log_id" => persistence_result["audit_log_id"],
        "risk_level" => @classification_result["risk_level"],
        "sanitization_applied" => @sanitization_result["change_count"].to_i > 0,
        "alert_sent" => alert_result["alert_sent"],
        "broadcasted" => broadcast_result["broadcasted"],
        "completed_at" => Time.now.utc.iso8601
      }
    end
  end
end
