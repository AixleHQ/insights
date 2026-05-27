# frozen_string_literal: true

module Mcp
  # Ensures ingest tool accounts exist for the given membership, rotates tokens,
  # and builds the JSON payload for POST /api/v1/integrations/mcp/exchange.
  class IngestTokenExchangeService
    Result = Struct.new(:http_status, :body, keyword_init: true)

    def self.call(membership:, tool_name:, tools:, ingest_host:)
      new(membership, tool_name, tools, ingest_host).call
    end

    def initialize(membership, tool_name, tools, ingest_host)
      @membership = membership
      @tool_name = tool_name
      @raw_tools = tools
      @ingest_host = ingest_host
    end

    def call
      requested_tools = normalize_requested_tools
      if requested_tools.empty?
        return Result.new(
          http_status: :unprocessable_content,
          body: {
            error: "Unprocessable Entity",
            errors: {
              base: [ "must provide tool_name or a non-empty tools array" ]
            }
          }
        )
      end

      invalid_tools_result = validate_tools(requested_tools)
      return invalid_tools_result if invalid_tools_result

      tool_accounts_by_name = {}
      validation_errors = nil

      @membership.with_lock do
        @membership.user_tool_accounts.transaction do
          requested_tools.each do |name|
            tool_account = @membership.user_tool_accounts.find_or_initialize_by(tool_name: name)
            tool_account.mark_waiting_for_connection if tool_account.may_mark_waiting_for_connection?

            unless tool_account.save
              validation_errors = tool_account.errors
              raise ActiveRecord::Rollback
            end

            tool_account.rotate_ingest_token!
            tool_accounts_by_name[name] = tool_account
          end
        end
      end

      if validation_errors
        return Result.new(
          http_status: :unprocessable_content,
          body: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(validation_errors)
          }
        )
      end

      accounts_payload = requested_tools.each_with_object({}) do |name, memo|
        acct = tool_accounts_by_name[name]
        memo[name] = { ingestToken: acct.plaintext_token }
      end

      data = {
        ingestHost: @ingest_host,
        organizationId: @membership.organization_id.to_s,
        accounts: accounts_payload
      }

      if requested_tools.one?
        data[:ingestToken] = accounts_payload[requested_tools.first]&.dig(:ingestToken)
        data[:toolName] = requested_tools.first
      end

      Result.new(http_status: :created, body: { data: data })
    end

    private

    def normalize_requested_tools
      tool_name_single = @tool_name.presence&.to_s
      if @raw_tools.present?
        Array.wrap(@raw_tools).map(&:to_s).uniq
      elsif tool_name_single.present?
        [ tool_name_single ]
      else
        []
      end
    end

    def validate_tools(requested_tools)
      invalid = requested_tools - UserToolAccount::INGEST_TOOLS
      return nil if invalid.empty?

      error_key = @raw_tools.present? ? :tools : :tool_name
      Result.new(
        http_status: :unprocessable_content,
        body: {
          error: "Unprocessable Entity",
          errors: {
            error_key => [ "must be one or more of: #{UserToolAccount::INGEST_TOOLS.join(', ')}" ]
          }
        }
      )
    end

    def format_validation_errors(errors)
      errors.to_hash(true).transform_values do |messages|
        messages.map { |msg| msg.is_a?(Hash) ? msg[:message] : msg }
      end
    end
  end
end
