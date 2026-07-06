# frozen_string_literal: true

class ScheduledExportMailer < ApplicationMailer
  def deliver(export, report)
    @export       = export
    @organization = export.organization

    filename = "db90-report-#{export.report_type}-#{Date.current.iso8601}.#{export.format}"
    content  = if export.format == "csv"
      AggregatedReportCsvExporter.generate(report.rows, report.columns)
    else
      report.rows.to_json
    end

    attachments[filename] = {
      mime_type: export.format == "csv" ? "text/csv" : "application/json",
      content:   content
    }

    mail(
      to:      export.recipients,
      subject: "#{export.organization.name} — #{export.report_type.humanize} Report"
    )
  end
end
