# frozen_string_literal: true

class ExportRecordSerializer < BaseSerializer
  attributes :id, :organization_id, :report_type, :format, :frequency, :status,
             :row_count, :file_size_bytes

  attribute :download_url do |record|
    next nil unless record.status == "ready" && !record.expired? && record.file.attached?

    # Generate a direct service URL (S3 presigned URL in staging/production).
    # rails_blob_url routes through the Rails redirect endpoint, which fails when
    # the API is not publicly reachable at the frontend host.
    record.file.blob.url(expires_in: 7.days, disposition: "attachment")
  end

  datetime_attribute :expires_at
  timestamps
end
