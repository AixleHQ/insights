# frozen_string_literal: true

class GenerateExportJob
  include Sidekiq::Job
  sidekiq_options queue: "exports", retry: 3

  def perform(export_record_id)
    record = ExportRecord.find(export_record_id)
    record.update!(status: "generating")

    report = AggregatedReportQueryBuilder.new(
      organization: record.organization,
      params: {
        report_type: record.report_type,
        format:      record.format
      }
    ).call

    content = if record.format == "csv"
      AggregatedReportCsvExporter.generate(report.rows, report.columns)
    else
      report.rows.to_json
    end

    filename = ExportReportFilename.build(
      organization: record.organization,
      report_type:  record.report_type,
      format:       record.format
    )
    mime = record.format == "csv" ? "text/csv" : "application/json"

    record.file.attach(
      io:           StringIO.new(content),
      filename:     filename,
      content_type: mime
    )

    record.update!(
      status:          "ready",
      row_count:       report.rows.size,
      file_size_bytes: content.bytesize,
      expires_at:      7.days.from_now
    )
  rescue => e
    record&.update_columns(status: "failed")
    Rails.logger.error("[GenerateExportJob] Failed for #{export_record_id}: #{e.message}")
    raise e
  end
end
