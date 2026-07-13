# frozen_string_literal: true

module ExportReportFilename
  module_function

  def build(organization:, report_type:, format:, date: Date.current)
    "#{organization.name.parameterize}-report-#{report_type}-#{date.iso8601}.#{format}"
  end
end
