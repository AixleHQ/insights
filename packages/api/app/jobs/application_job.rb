class ApplicationJob < ActiveJob::Base
  # Automatically retry jobs that encountered a deadlock
  # retry_on ActiveRecord::Deadlocked

  # Most jobs are safe to ignore if the underlying records are no longer available
  # discard_on ActiveJob::DeserializationError

  # Third argument to perform(connector_id, action = "sync", options = {}).
  # When enqueue uses only two args (e.g. perform_later(id, "sync")), the last
  # argument is the action String — do not call String#to_h on it.
  def self.symbolized_job_options(job)
    arg = job.arguments[2]
    hash =
      case arg
      when Hash then arg
      when ActionController::Parameters then arg.to_unsafe_h
      else {}
      end
    hash.symbolize_keys
  end
end
