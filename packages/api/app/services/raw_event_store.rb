require "aws-sdk-s3"
require "securerandom"
require "openssl"

class RawEventStore
  BUCKET_NAME = "raw-events".freeze
  ENCRYPTION_ALGORITHM = "aes-256-gcm".freeze
  KEY_LENGTH = 32
  IV_LENGTH = 12
  AUTH_TAG_LENGTH = 16

  class << self
    def store(payload, organization_id:, metadata: {})
      key = generate_key(organization_id)
      plaintext = payload.is_a?(String) ? payload : payload.to_json
      encrypted_data, iv, auth_tag = encrypt(plaintext)

      client.put_object(
        bucket: bucket_name,
        key: key,
        body: encrypted_data,
        metadata: {
          "organization-id" => organization_id.to_s,
          "iv" => Base64.strict_encode64(iv),
          "auth-tag" => Base64.strict_encode64(auth_tag),
          "created-at" => Time.current.iso8601
        }.merge(metadata.transform_keys(&:to_s))
      )

      key
    end

    def fetch(key)
      response = client.get_object(
        bucket: bucket_name,
        key: key
      )

      iv = Base64.strict_decode64(response.metadata["iv"])
      auth_tag = Base64.strict_decode64(response.metadata["auth-tag"])
      encrypted_data = response.body.read

      decrypted = decrypt(encrypted_data, iv, auth_tag)
      parsed = JSON.parse(decrypted)
      parsed = JSON.parse(parsed) if parsed.is_a?(String)
      parsed
    rescue Aws::S3::Errors::NoSuchKey
      nil
    end

    def delete(key)
      client.delete_object(
        bucket: bucket_name,
        key: key
      )
      true
    rescue Aws::S3::Errors::NoSuchKey
      false
    end

    def exists?(key)
      client.head_object(
        bucket: bucket_name,
        key: key
      )
      true
    rescue Aws::S3::Errors::NotFound
      false
    end

    def list_keys(organization_id:, prefix: nil, limit: 1000)
      full_prefix = "#{organization_id}/"
      full_prefix += prefix if prefix

      response = client.list_objects_v2(
        bucket: bucket_name,
        prefix: full_prefix,
        max_keys: limit
      )

      response.contents.map(&:key)
    end

    def metadata(key)
      response = client.head_object(
        bucket: bucket_name,
        key: key
      )
      response.metadata
    rescue Aws::S3::Errors::NotFound
      nil
    end

    def ensure_bucket_exists!
      client.head_bucket(bucket: bucket_name)
    rescue Aws::S3::Errors::NotFound
      client.create_bucket(bucket: bucket_name)
      configure_lifecycle_policy!
    end

    private

    def client
      @client ||= Aws::S3::Client.new(
        endpoint: endpoint_url,
        region: region,
        access_key_id: access_key_id,
        secret_access_key: secret_access_key,
        force_path_style: true
      )
    end

    def endpoint_url
      ENV.fetch("MINIO_ENDPOINT", "http://localhost:9000")
    end

    def region
      ENV.fetch("MINIO_REGION", "us-east-1")
    end

    def access_key_id
      ENV.fetch("MINIO_ACCESS_KEY", "minioadmin")
    end

    def secret_access_key
      ENV.fetch("MINIO_SECRET_KEY", "minioadmin")
    end

    def bucket_name
      ENV.fetch("RAW_EVENTS_BUCKET", BUCKET_NAME)
    end

    def encryption_key
      @encryption_key ||= begin
        key = ENV.fetch("RAW_EVENT_ENCRYPTION_KEY", nil)
        if key.nil? || key.empty?
          Rails.logger.warn("[RawEventStore] Using default encryption key - not suitable for production!")
          "default_dev_key_32_characters__"
        else
          key
        end
      end
    end

    def generate_key(organization_id)
      timestamp = Time.current.strftime("%Y/%m/%d/%H")
      uuid = SecureRandom.uuid
      "#{organization_id}/#{timestamp}/#{uuid}.enc"
    end

    def encrypt(plaintext)
      cipher = OpenSSL::Cipher.new(ENCRYPTION_ALGORITHM)
      cipher.encrypt
      cipher.key = encryption_key.byteslice(0, KEY_LENGTH).ljust(KEY_LENGTH, "\0")
      iv = cipher.random_iv
      cipher.auth_data = ""

      encrypted = cipher.update(plaintext) + cipher.final
      auth_tag = cipher.auth_tag

      [ encrypted, iv, auth_tag ]
    end

    def decrypt(ciphertext, iv, auth_tag)
      decipher = OpenSSL::Cipher.new(ENCRYPTION_ALGORITHM)
      decipher.decrypt
      decipher.key = encryption_key.byteslice(0, KEY_LENGTH).ljust(KEY_LENGTH, "\0")
      decipher.iv = iv
      decipher.auth_tag = auth_tag
      decipher.auth_data = ""

      decipher.update(ciphertext) + decipher.final
    end

    def configure_lifecycle_policy!
      client.put_bucket_lifecycle_configuration(
        bucket: bucket_name,
        lifecycle_configuration: {
          rules: [
            {
              id: "expire-raw-events",
              status: "Enabled",
              filter: { prefix: "" },
              expiration: { days: 3 }
            }
          ]
        }
      )
    end
  end
end
