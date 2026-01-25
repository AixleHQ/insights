require "temporalio/activity"

module Activities
  class GreetingActivity < Temporalio::Activity::Definition
    def execute(name)
      Temporalio::Activity::Context.current.heartbeat("Processing greeting for #{name}")
      "Hello, #{name}! Welcome to DB90."
    end
  end
end
