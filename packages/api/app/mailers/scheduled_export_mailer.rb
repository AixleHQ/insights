# frozen_string_literal: true

class ScheduledExportMailer < ApplicationMailer
  def export_report(export, report)
    @export            = export
    @organization      = export.organization
    @generated_at      = Time.current
    @report_type_label = export.report_type.humanize

    filename = ExportReportFilename.build(
      organization: export.organization,
      report_type:  export.report_type,
      format:       export.format
    )
    content, mime_type = if export.format == "csv"
      [ AggregatedReportCsvExporter.generate(report.rows, report.columns), "text/csv" ]
    else
      [ report.rows.to_json, "application/json" ]
    end

    attachments[filename] = { mime_type:, content: }

    mail(
      to:      export.recipients,
      subject: "#{@organization.name} — #{@report_type_label} Report"
    )
  end
end
