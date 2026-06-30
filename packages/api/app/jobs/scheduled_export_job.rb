# frozen_string_literal: true

class ScheduledExportJob
  include Sidekiq::Job
  sidekiq_options queue: "default", retry: 3

  def perform
    ScheduledExport
      .where(active: true)
      .where("next_run_at <= ?", Time.current)
      .lock("FOR UPDATE SKIP LOCKED")
      .find_each do |export|
        generate_and_deliver(export)
        export.advance_next_run_at!
      rescue => e
        Rails.logger.error("[ScheduledExportJob] Failed for #{export.id}: #{e.message}")
      end
  end

  private

  def generate_and_deliver(export)
    report = AggregatedReportQueryBuilder.new(
      organization: export.organization,
      params: {
        report_type: export.report_type,
        format:      export.format,
        group_by:    export.group_by
      }
    ).call

    ScheduledExportMailer.deliver(export, report).deliver_later
  end
end
