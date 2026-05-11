# frozen_string_literal: true

module IngestRateLimiter
  extend ActiveSupport::Concern

  included do
    # Must run AFTER authenticate_by_token! so @tool_account is populated.
    before_action :check_ingest_rate_limit!
    before_action :check_ingest_quota!
  end

  private

  def check_ingest_rate_limit!
    org = @tool_account.organization
    limit = OrganizationSetting.get(org, "ingest_rate_limit_per_minute")&.to_i ||
            [ ENV.fetch("INGEST_RATE_LIMIT_DEFAULT", "1000").to_i, 1 ].max

    window = Time.current.to_i / 60
    count = Rails.cache.increment("ingest:rate:#{org.id}:#{window}", 1, expires_in: 70.seconds)

    if count.nil?
      Rails.logger.warn("[Ingest] Redis unavailable for rate limit check — failing open")
      return
    end

    return if count <= limit

    response.set_header("Retry-After", "60")
    render json: { error: "Rate Limited", code: "rate_limit_exceeded", retry_after: 60 },
           status: :too_many_requests
  end

  def check_ingest_quota!
    org = @tool_account.organization
    quota = OrganizationSetting.get(org, "ingest_monthly_event_quota")&.to_i
    return if quota.nil?

    month_key = "ingest:quota:#{org.id}:#{Time.current.strftime('%Y-%m')}"
    count = Rails.cache.increment(month_key, 1, expires_in: 35.days)

    if count.nil?
      Rails.logger.warn("[Ingest] Redis unavailable for quota check — failing open")
      return
    end

    return if count <= quota

    resets_at = Time.current.next_month.beginning_of_month
    retry_after = [ (resets_at - Time.current).to_i, 3600 ].min
    retry_after = [ retry_after, 1 ].max
    response.set_header("Retry-After", retry_after.to_s)
    render json: {
      error: "Quota Exceeded",
      code: "quota_exceeded",
      retry_after: retry_after,
      quota_resets_at: resets_at.iso8601
    }, status: :too_many_requests
  end
end
