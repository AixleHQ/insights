class ApplicationMailer < ActionMailer::Base
  # Pin the async delivery queue name so it always matches a queue Sidekiq is
  # configured to process (see config/sidekiq.yml). Without this, deliver_later
  # falls back to the "mailers" queue, which must stay listed there (AIX-468).
  self.deliver_later_queue_name = "mailers"

  default from: ENV.fetch("MAILER_FROM", "noreply@db90.dev")
  layout "mailer"
end
