# frozen_string_literal: true

class ExportRecordSerializer < BaseSerializer
  attributes :id, :organization_id, :report_type, :format, :frequency, :status,
             :row_count, :file_size_bytes

  attribute :download_url do |record|
    next nil unless record.status == "ready" && !record.expired? && record.file.attached?

    url_opts = Rails.application.config.action_mailer.default_url_options || {}
    Rails.application.routes.url_helpers.rails_blob_url(
      record.file,
      host:        url_opts.fetch(:host, "localhost"),
      protocol:    url_opts.fetch(:protocol, "http"),
      disposition: "attachment",
      expires_in:  7.days
    )
  end

  datetime_attribute :expires_at
  timestamps
end
