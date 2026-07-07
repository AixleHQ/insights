require "temporalio/activity"
require "aws-sdk-s3"
require "json"
require "openssl"
require "base64"

module Activities
  class FetchRawEventActivity < Temporalio::Activity::Definition
    ENCRYPTION_ALGORITHM = "aes-256-gcm".freeze
    KEY_LENGTH = 32

    def execute(params)
      Temporalio::Activity::Context.current.heartbeat("Fetching raw event from storage")

      bucket = params["bucket"] || ENV.fetch("RAW_EVENTS_BUCKET", ENV.fetch("MINIO_BUCKET", "raw-events"))
      key = params["key"]
      @current_key = key

      response = s3_client.get_object(bucket: bucket, key: key)
      encrypted_data = response.body.read
      decrypted = decrypt_event(encrypted_data, response.metadata)

      {
        "raw_payload" => decrypted,
        "metadata" => {
          "bucket" => bucket,
          "key" => key,
          "content_type" => response.content_type,
          "last_modified" => response.last_modified&.iso8601
        }
      }
    rescue Aws::S3::Errors::NoSuchKey
      raise "Raw event not found: #{key}"
    end

    private

    def decrypt_event(ciphertext, metadata)
      return ciphertext if metadata.nil? || metadata["iv"].nil? || metadata["auth-tag"].nil?

      iv = Base64.strict_decode64(metadata["iv"])
      auth_tag = Base64.strict_decode64(metadata["auth-tag"])

      decipher = OpenSSL::Cipher.new(ENCRYPTION_ALGORITHM)
      decipher.decrypt
      decipher.key = encryption_key.byteslice(0, KEY_LENGTH).ljust(KEY_LENGTH, "\0")
      decipher.iv = iv
      decipher.auth_tag = auth_tag
      decipher.auth_data = ""

      decipher.update(ciphertext) + decipher.final
    rescue OpenSSL::Cipher::CipherError, ArgumentError => e
      raise "Decryption failed for key #{@current_key.inspect}: #{e.message}"
    end

    def s3_client
      @s3_client ||= Aws::S3::Client.new(s3_client_options)
    end

    def s3_client_options
      endpoint = ENV["MINIO_ENDPOINT"].presence
      region = ENV.fetch("S3_REGION", ENV.fetch("MINIO_REGION", "us-east-1"))
      options = { region: region }

      if endpoint.present?
        options[:endpoint] = endpoint
        options[:force_path_style] = true
        options[:access_key_id] = ENV.fetch("MINIO_ACCESS_KEY", "minioadmin")
        options[:secret_access_key] = ENV.fetch("MINIO_SECRET_KEY", "minioadmin")
      end

      options
    end

    def encryption_key
      key = ENV.fetch("RAW_EVENT_ENCRYPTION_KEY", nil)
      if key.nil? || key.empty?
        "default_dev_key_32_characters__"
      else
        key
      end
    end
  end
end
