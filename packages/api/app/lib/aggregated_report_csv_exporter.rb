# frozen_string_literal: true

require "csv"

# Generates a CSV string from aggregated report rows.
#
# Usage:
#   AggregatedReportCsvExporter.generate(rows, columns)
#
# rows    — Array<Hash> with string keys, as produced by AggregatedReportQueryBuilder
# columns — Array<String> of column names (defines header order)
module AggregatedReportCsvExporter
  def self.generate(rows, columns)
    CSV.generate(headers: true) do |csv|
      csv << columns
      rows.each { |row| csv << columns.map { |col| row[col] } }
    end
  end
end
