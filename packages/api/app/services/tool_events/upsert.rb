# frozen_string_literal: true

module ToolEvents
  # Creates or updates a tool_event, deduplicating on session_id.
  #
  # Context: db90-claude (the CLI connector) re-sends a session when its JSONL
  # transcript file grows. Each re-send should UPDATE the existing record (with
  # the latest aggregated token counts) rather than create a new row. Without
  # this, the Events page accumulates duplicate rows that inflate apparent cost.
  #
  # TimescaleDB constraint: UNIQUE indexes on hypertables must include the
  # partition column (occurred_at). Since occurred_at must not change after
  # creation, we enforce uniqueness here at the application layer instead.
  # See also +ToolEvents::ConnectorUpsert+ for connector webhook dedupe by metadata keys.
  #
  # Race-condition safety: pg_advisory_xact_lock serialises concurrent requests
  # for the same session_id, eliminating the TOCTOU window in the naive
  # find-then-insert approach.
  class Upsert
    MUTABLE_FIELDS = %i[
      tokens_in tokens_out tokens_total cost_usd
      model duration_ms project_id metadata
    ].freeze

    # Server-stamped metadata — stripped from incoming payloads so clients
    # cannot forge it: renormalization provenance (AIX-260) and PR
    # correlation results (AIX-261; a forged pr_url is a malicious link
    # rendered in the UI). jira_ticket is deliberately NOT reserved — clients
    # may supply it directly.
    RESERVED_METADATA_KEYS = %w[
      renormalized_from renormalized_by
      pr_number pr_url pr_state pr_lookup_status
    ].freeze

    # @return [Hash] { tool_event: ToolEvent, created: Boolean }
    def self.call(attributes)
      new(attributes).call
    end

    def initialize(attributes)
      @attributes = attributes
      @session_id = attributes.dig(:metadata, "session_id") ||
                    attributes.dig(:metadata, :session_id)
    end

    def call
      strip_reserved_metadata!
      promote_model_from_metadata!
      enrich_cost!

      if @session_id.present?
        upsert_with_lock
      else
        normalize_event_type!
        extract_jira_ticket!
        event = ToolEvent.create!(@attributes)
        enqueue_pr_correlation(event)
        { tool_event: event, created: true }
      end
    end

    private

    def promote_model_from_metadata!
      return if @attributes[:model].present?

      model_from_metadata = @attributes.dig(:metadata, "model") ||
                            @attributes.dig(:metadata, :model)
      return if model_from_metadata.blank?

      @attributes[:model] = model_from_metadata
    end

    def enrich_cost!
      cost       = @attributes[:cost_usd]
      t_in       = @attributes[:tokens_in]
      t_out      = @attributes[:tokens_out]
      cost_model = @attributes.dig(:metadata, "cost_model") ||
                   @attributes.dig(:metadata, :cost_model)

      # Line-count events store line counts in tokens_in/tokens_out, not real tokens.
      # Move the line counts into metadata so they don't inflate token aggregations,
      # and never re-price these events with token-based pricing.
      if cost_model == "estimated_line_count"
        @attributes[:metadata] = (@attributes[:metadata] || {}).merge(
          "cost_source"     => "client",
          "lines_suggested" => @attributes[:tokens_in],
          "lines_accepted"  => @attributes[:tokens_out]
        )
        @attributes[:tokens_in]  = nil
        @attributes[:tokens_out] = nil
        return
      end

      if (cost.nil? || cost.to_f.zero?) && (t_in.present? || t_out.present?)
        result = ModelPricingService.calculate_cost(
          tokens_in:    t_in.to_i,
          tokens_out:   t_out.to_i,
          model:        @attributes[:model],
          tool:         @attributes[:tool_name],
          organization: organization
        )
        @attributes[:cost_usd] = result[:total_cost]

        set_cost_source("server_estimated")
      else
        set_cost_source("client")
      end
    end

    def set_cost_source(source)
      @attributes[:metadata] = (@attributes[:metadata] || {}).merge("cost_source" => source)
    end

    # Clients must not be able to forge server renormalization provenance —
    # reserved keys are stripped on every path, even with the feature flag off.
    def strip_reserved_metadata!
      metadata = @attributes[:metadata]
      return unless metadata.is_a?(Hash)

      @attributes[:metadata] = metadata.except(
        *RESERVED_METADATA_KEYS,
        *RESERVED_METADATA_KEYS.map(&:to_sym)
      )
    end

    # Re-tags generic "chat" events into finer types (commit/test/edit) from
    # metadata hints — defensive net for pre-T-02 CLIs (AIX-260). Called
    # only on the create branches: session re-sends must never flip an existing
    # row's type nor stamp renormalized_* metadata onto it (event_type is
    # intentionally NOT in MUTABLE_FIELDS, but metadata is).
    def normalize_event_type!
      return unless renormalization_enabled?

      derived = EventTypeNormalizer.derive(
        event_type: @attributes[:event_type],
        metadata:   @attributes[:metadata]
      )
      return if derived.nil? || derived == @attributes[:event_type]

      original = @attributes[:event_type]
      @attributes[:event_type] = derived
      @attributes[:metadata] = (@attributes[:metadata] || {}).merge(
        "renormalized_from" => original,
        "renormalized_by"   => "server_v1"
      )
    end

    # Stamps the Jira ticket key derived from metadata hints (AIX-261).
    # Create branches only — session re-sends must not stamp (same contract
    # as normalize_event_type!). A client-supplied value wins only when it
    # fully matches the ticket pattern; anything else is dropped before it
    # can reach the serializer (review decision D4).
    def extract_jira_ticket!
      metadata = @attributes[:metadata]
      client_value = metadata.is_a?(Hash) ? (metadata["jira_ticket"] || metadata[:jira_ticket]) : nil

      if client_value.present?
        normalized = MetadataEnrichers::JiraTicketExtractor.normalize(client_value)
        if normalized
          @attributes[:metadata] = metadata.except(:jira_ticket).merge("jira_ticket" => normalized)
          return
        end

        metadata = metadata.except("jira_ticket", :jira_ticket)
        @attributes[:metadata] = metadata
      end

      ticket = MetadataEnrichers::JiraTicketExtractor.extract(metadata)
      return if ticket.nil?

      @attributes[:metadata] = (metadata || {}).merge("jira_ticket" => ticket)
    end

    # Default ON outside production; production opts in by setting
    # DB90_EVENT_TYPE_RENORMALIZATION=true on the Rails API deployment.
    def renormalization_enabled?
      default = Rails.env.production? ? "false" : "true"
      ActiveModel::Type::Boolean.new.cast(ENV.fetch("DB90_EVENT_TYPE_RENORMALIZATION", default)) || false
    end

    # Kicks off async PR correlation for freshly created commit events
    # (AIX-261). Create-only by construction (both call sites sit on the
    # create branches); the GitHub lookup itself runs in Sidekiq, never on
    # the ingest hot path.
    def enqueue_pr_correlation(event)
      return unless pr_correlation_enabled?
      return unless @attributes[:event_type] == "commit"

      metadata = @attributes[:metadata]
      return unless metadata.is_a?(Hash)

      commit_hash = metadata["commit_hash"].presence || metadata[:commit_hash].presence ||
                    metadata["sha"].presence || metadata[:sha].presence
      return if commit_hash.blank?

      PrCorrelationJob.perform_later(event.id)
    end

    # Default ON outside production; production opts in by setting
    # DB90_PR_CORRELATION=true on the Rails API deployment.
    def pr_correlation_enabled?
      default = Rails.env.production? ? "false" : "true"
      ActiveModel::Type::Boolean.new.cast(ENV.fetch("DB90_PR_CORRELATION", default)) || false
    end

    def upsert_with_lock
      ToolEvent.transaction do
        # Advisory lock auto-released at transaction end — serialises concurrent
        # requests for the same session_id to eliminate the TOCTOU window.
        lock_key = Zlib.crc32(@session_id)
        ToolEvent.connection.execute("SELECT pg_advisory_xact_lock(#{Integer(lock_key)})")

        existing = ToolEvent
          .where(organization_id: @attributes[:organization_id])
          .where("metadata->>'session_id' = ?", @session_id)
          .first

        if existing
          existing.update!(mutable_attributes)
          { tool_event: existing, created: false }
        else
          normalize_event_type!
          extract_jira_ticket!
          event = ToolEvent.create!(@attributes)
          enqueue_pr_correlation(event)
          { tool_event: event, created: true }
        end
      end
    end

    def mutable_attributes
      @attributes.slice(*MUTABLE_FIELDS)
    end

    def organization
      @organization ||= Organization.find(@attributes[:organization_id])
    end
  end
end
