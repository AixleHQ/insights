class ApplicationMailer < ActionMailer::Base
  # Pin the async delivery queue name so it always matches a queue Sidekiq is
  # configured to process (see config/sidekiq.yml). Without this, deliver_later
  # falls back to the "mailers" queue, which must stay listed there (AIX-468).
  self.deliver_later_queue_name = "mailers"

  default from: ENV.fetch("MAILER_FROM", "noreply@aixle.ai")

  # All mailer templates are self-contained HTML documents. Using the shared
  # layout would wrap them in a second <html>/<body> shell that email clients
  # strip unpredictably (AIX-289). Disable it at the base so subclasses
  # don't have to each remember to opt out.
  layout false
end
