require "temporalio/workflow"

module Workflows
  class HelloWorkflow < Temporalio::Workflow::Definition
    workflow_query_attr_reader :current_greeting

    def execute(name)
      @current_greeting = "Hello, #{name}!"

      # Execute the greeting activity
      result = Temporalio::Workflow.execute_activity(
        Activities::GreetingActivity,
        name,
        start_to_close_timeout: 10
      )

      @current_greeting = result
      result
    end
  end
end
