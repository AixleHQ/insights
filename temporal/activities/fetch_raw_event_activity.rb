require "temporalio/activity"
require "aws-sdk-s3"
require "json"

module Activities
  class FetchRawEventActivity < Temporalio::Activity::Definition
    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Fetching raw event from storage")

      bucket = params["bucket"] || ENV.fetch("MINIO_BUCKET", "db90-raw-events")
      key = params["key"]

      client = Aws::S3::Client.new(
        endpoint: ENV.fetch("MINIO_ENDPOINT", "http://localhost:9000"),
        access_key_id: ENV.fetch("MINIO_ACCESS_KEY", "minioadmin"),
        secret_access_key: ENV.fetch("MINIO_SECRET_KEY", "minioadmin"),
        region: ENV.fetch("MINIO_REGION", "us-east-1"),
        force_path_style: true
      )

      response = client.get_object(bucket: bucket, key: key)
      encrypted_data = response.body.read

      # Decrypt if encrypted
      decrypted = decrypt_event(encrypted_data)

      {
        "raw_payload" => decrypted,
        "metadata" => {
          "bucket" => bucket,
          "key" => key,
          "content_type" => response.content_type,
          "last_modified" => response.last_modified&.iso8601
        }
      }
    rescue Aws::S3::Errors::NoSuchKey => e
      raise "Raw event not found: #{key}"
    end

    private

    def decrypt_event(data)
      # Check if data is encrypted (starts with encrypted marker)
      parsed = JSON.parse(data) rescue nil
      return data unless parsed.is_a?(Hash) && parsed["encrypted"]

      encryption_key = ENV.fetch("RAW_EVENT_ENCRYPTION_KEY")
      iv = Base64.decode64(parsed["iv"])
      encrypted_data = Base64.decode64(parsed["data"])

      cipher = OpenSSL::Cipher.new("aes-256-gcm")
      cipher.decrypt
      cipher.key = [encryption_key].pack("H*")
      cipher.iv = iv
      cipher.auth_tag = Base64.decode64(parsed["auth_tag"])
      cipher.auth_data = ""

      cipher.update(encrypted_data) + cipher.final
    rescue JSON::ParserError
      # Not JSON, return as-is
      data
    rescue => e
      # If decryption fails, return raw data (might not be encrypted)
      data
    end
  end
end
