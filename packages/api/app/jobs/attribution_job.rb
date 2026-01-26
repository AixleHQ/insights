# frozen_string_literal: true

class AttributionJob
  include Sidekiq::Job

  sidekiq_options queue: 'ai', retry: 3

  DEFAULT_BATCH_SIZE = 1000
  MIN_CONFIDENCE = 0.7

  def perform(organization_id = nil, options = {})
    Rails.logger.info('[AttributionJob] Starting event attribution...')

    batch_size = options['batch_size'] || DEFAULT_BATCH_SIZE
    min_confidence = options['min_confidence'] || MIN_CONFIDENCE

    stats = { organizations_processed: 0, events_attributed: 0, errors: [] }

    organizations = if organization_id
                      Organization.where(id: organization_id)
                    else
                      Organization.all
                    end

    organizations.find_each do |org|
      begin
        attributed = attribute_organization_events(org, batch_size, min_confidence)
        stats[:organizations_processed] += 1
        stats[:events_attributed] += attributed
      rescue => e
        stats[:errors] << { organization_id: org.id, error: e.message }
        Rails.logger.error("[AttributionJob] Error attributing org #{org.slug}: #{e.message}")
      end
    end

    Rails.logger.info("[AttributionJob] Completed. Processed: #{stats[:organizations_processed]}, Attributed: #{stats[:events_attributed]}, Errors: #{stats[:errors].size}")
    stats
  end

  private

  def attribute_organization_events(org, batch_size, min_confidence)
    result = Ai::CorrelationService.correlate_unattributed(
      organization: org,
      limit: batch_size
    )

    Rails.logger.info("[AttributionJob] Org #{org.slug}: Correlated #{result[:correlated]}, Failed #{result[:failed]}")

    result[:correlated]
  end
end
