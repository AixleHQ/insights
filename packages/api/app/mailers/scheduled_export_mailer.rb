# frozen_string_literal: true

class ScheduledExportMailer < ApplicationMailer
  def export_report(export, report)
    @export       = export
    @organization = export.organization

    filename = ExportReportFilename.build(
      organization: export.organization,
      report_type:  export.report_type,
      format:       export.format
    )
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
