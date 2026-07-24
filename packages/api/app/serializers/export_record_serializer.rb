# frozen_string_literal: true

class ExportRecordSerializer < BaseSerializer
  attributes :id, :organization_id, :report_type, :format, :frequency, :status,
             :row_count, :file_size_bytes

  attribute :created_by do |record|
    if record.created_by
      {
        id:    record.created_by.id,
        name:  record.created_by.name,
        email: record.created_by.email
      }
    end
  end

  attribute :download_url do |record|
    next nil unless record.status == "ready" && !record.expired? && record.file.attached?

    filename = ExportReportFilename.build(
      organization: record.organization,
      report_type:  record.report_type,
      format:       record.format,
      date:         record.created_at.to_date
    )

    # Generate a direct service URL (S3 presigned URL in staging/production).
    # rails_blob_url routes through the Rails redirect endpoint, which fails when
    # the API is not publicly reachable at the frontend host.
    record.file.blob.url(expires_in: 7.days, disposition: "attachment", filename: filename)
  end

  datetime_attribute :expires_at
  timestamps
end
