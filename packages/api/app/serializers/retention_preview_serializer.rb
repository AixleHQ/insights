# frozen_string_literal: true

class RetentionPreviewSerializer < BaseSerializer
  Payload = Struct.new(:cutoff_date, :estimated_records, keyword_init: true)

  attributes :cutoff_date, :estimated_records
end
