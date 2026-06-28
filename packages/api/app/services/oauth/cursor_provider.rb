# frozen_string_literal: true

module Oauth
  class CursorProvider < BaseProvider
    API_URL = "https://api.cursor.com"
    PAGE_SIZE = 100

    # Cursor uses API-key auth (Basic Auth: key + empty password), not OAuth.
    # No authorize_endpoint / exchange_code / refresh_token! — key is stored directly
    # in connector.access_token by the create action.
    def test_connection
      response = members_response
      case response.status
      when 200
        { success: true }
      when 401, 403
        { success: false, error: "Invalid or unauthorised Cursor API key." }
      else
        { success: false, error: "Cursor API error: HTTP #{response.status}" }
      end
    rescue Faraday::Error => e
      { success: false, error: "Connection error: #{e.message}" }
    end

    # Returns { seat_count: Integer } — active members only (isRemoved: false).
    def fetch_seats
      response = members_response
      raise "Cursor /teams/members returned HTTP #{response.status}" unless response.success?

      data    = JSON.parse(response.body)
      members = Array(data["teamMembers"])
      { seat_count: members.reject { |m| m["isRemoved"] }.count }
    end

    # Paginates POST /teams/spend and aggregates across all pages.
    # spendCents is on-demand spend excluding the included allowance (= overage).
    # overallSpendCents includes the included allowance (stored for reconciliation).
    # subscriptionCycleStart is epoch milliseconds — converted to ISO8601.
    #
    # totalPages is read once from the first page and not updated on subsequent pages
    # (||= is intentional — the API may echo it on every page but the first value
    # is authoritative for loop termination).
    #
    # Returns:
    #   overage_spend_cents:   Float   (sum of spendCents — preserve fractional cents)
    #   overall_spend_cents:   Float   (sum of overallSpendCents)
    #   fast_premium_requests: Integer
    #   billing_cycle_start:   String  (ISO8601)
    #   total_members:         Integer (from API — useful for seat count cross-check)
    def fetch_spend
      page                  = 1
      overage_spend         = 0.0
      overall_spend         = 0.0
      fast_premium_requests = 0
      billing_cycle_start   = nil
      total_members         = nil
      total_pages           = nil

      loop do
        response = cursor_client.post("#{API_URL}/teams/spend") do |req|
          req.headers["Content-Type"] = "application/json"
          req.body = JSON.generate(page: page, pageSize: PAGE_SIZE)
        end
        raise "Cursor /teams/spend returned HTTP #{response.status}" unless response.success?

        data          = JSON.parse(response.body)
        # Treat missing/zero totalPages as 1 so a new or empty team gets one valid iteration
        # rather than silently writing nil billing data to config.
        total_pages   ||= [ data["totalPages"].to_i, 1 ].max
        total_members ||= data["totalMembers"].to_i
        billing_cycle_start ||= epoch_ms_to_iso8601(data["subscriptionCycleStart"])

        Array(data["teamMemberSpend"]).each do |member|
          overage_spend         += member["spendCents"].to_f
          overall_spend         += member["overallSpendCents"].to_f
          fast_premium_requests += member["fastPremiumRequests"].to_i
        end

        break if page >= total_pages

        page += 1
      end

      {
        overage_spend_cents:   overage_spend,
        overall_spend_cents:   overall_spend,
        fast_premium_requests: fast_premium_requests,
        billing_cycle_start:   billing_cycle_start,
        total_members:         total_members
      }
    end

    private

    # Memoised so test_connection and fetch_seats share one HTTP call per provider instance.
    def members_response
      @members_response ||= cursor_client.get("#{API_URL}/teams/members")
    end

    def cursor_client
      @cursor_client ||= Faraday.new do |conn|
        conn.headers["Authorization"] = "Basic #{Base64.strict_encode64("#{connector.access_token}:")}"
        conn.headers["Accept"]        = "application/json"
        conn.adapter Faraday.default_adapter
      end
    end

    def epoch_ms_to_iso8601(epoch_ms)
      return nil if epoch_ms.nil?

      Time.at(epoch_ms.to_f / 1000.0).utc.iso8601
    end
  end
end
