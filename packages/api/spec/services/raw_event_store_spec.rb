require 'rails_helper'

RSpec.describe RawEventStore do
  let(:organization_id) { SecureRandom.uuid }
  let(:payload) { { prompt: 'Hello world', tool: 'claude_code' } }
  let(:s3_client) { instance_double(Aws::S3::Client) }

  before do
    allow(Aws::S3::Client).to receive(:new).and_return(s3_client)
    # Clear memoized client between tests
    described_class.instance_variable_set(:@client, nil)
  end

  describe '.store' do
    it 'stores encrypted payload in S3' do
      allow(s3_client).to receive(:put_object)

      key = described_class.store(payload, organization_id: organization_id)

      expect(key).to start_with("#{organization_id}/")
      expect(key).to end_with('.enc')
      expect(s3_client).to have_received(:put_object) do |args|
        expect(args[:bucket]).to eq('raw-events')
        expect(args[:key]).to eq(key)
        expect(args[:body]).to be_a(String)
        expect(args[:metadata]['organization-id']).to eq(organization_id)
        expect(args[:metadata]['iv']).to be_present
        expect(args[:metadata]['auth-tag']).to be_present
        expect(args[:metadata]['created-at']).to be_present
      end
    end

    it 'generates a key with timestamp structure' do
      allow(s3_client).to receive(:put_object)

      freeze_time do
        key = described_class.store(payload, organization_id: organization_id)
        expected_prefix = "#{organization_id}/#{Time.current.strftime('%Y/%m/%d/%H')}"
        expect(key).to start_with(expected_prefix)
      end
    end

    it 'includes custom metadata' do
      allow(s3_client).to receive(:put_object)

      described_class.store(payload, organization_id: organization_id, metadata: { source: 'webhook' })

      expect(s3_client).to have_received(:put_object) do |args|
        expect(args[:metadata]['source']).to eq('webhook')
      end
    end
  end

  describe '.fetch' do
    let(:key) { "#{organization_id}/2026/01/25/12/abc123.enc" }
    let(:iv) { OpenSSL::Random.random_bytes(12) }
    let(:auth_tag) { OpenSSL::Random.random_bytes(16) }

    it 'decrypts and returns the payload' do
      # First store to get valid encrypted data
      encryption_key = 'default_dev_key_32_characters__'.byteslice(0, 32).ljust(32, "\0")
      cipher = OpenSSL::Cipher.new('aes-256-gcm')
      cipher.encrypt
      cipher.key = encryption_key
      cipher.iv = iv
      cipher.auth_data = ''
      encrypted = cipher.update(payload.to_json) + cipher.final
      real_auth_tag = cipher.auth_tag

      response = double(
        'S3Response',
        body: StringIO.new(encrypted),
        metadata: {
          'iv' => Base64.strict_encode64(iv),
          'auth-tag' => Base64.strict_encode64(real_auth_tag)
        }
      )

      allow(s3_client).to receive(:get_object).and_return(response)

      result = described_class.fetch(key)

      expect(result).to eq(payload.stringify_keys)
    end

    it 'returns nil when key does not exist' do
      allow(s3_client).to receive(:get_object).and_raise(Aws::S3::Errors::NoSuchKey.new(nil, 'Not found'))

      result = described_class.fetch(key)

      expect(result).to be_nil
    end
  end

  describe '.delete' do
    let(:key) { "#{organization_id}/2026/01/25/12/abc123.enc" }

    it 'deletes the object and returns true' do
      allow(s3_client).to receive(:delete_object)

      result = described_class.delete(key)

      expect(result).to be true
      expect(s3_client).to have_received(:delete_object).with(bucket: 'raw-events', key: key)
    end

    it 'returns false when key does not exist' do
      allow(s3_client).to receive(:delete_object).and_raise(Aws::S3::Errors::NoSuchKey.new(nil, 'Not found'))

      result = described_class.delete(key)

      expect(result).to be false
    end
  end

  describe '.exists?' do
    let(:key) { "#{organization_id}/2026/01/25/12/abc123.enc" }

    it 'returns true when object exists' do
      allow(s3_client).to receive(:head_object)

      result = described_class.exists?(key)

      expect(result).to be true
    end

    it 'returns false when object does not exist' do
      allow(s3_client).to receive(:head_object).and_raise(Aws::S3::Errors::NotFound.new(nil, 'Not found'))

      result = described_class.exists?(key)

      expect(result).to be false
    end
  end

  describe '.list_keys' do
    it 'returns keys for organization' do
      keys = [
        double(key: "#{organization_id}/2026/01/25/12/abc123.enc"),
        double(key: "#{organization_id}/2026/01/25/12/def456.enc")
      ]
      response = double(contents: keys)
      allow(s3_client).to receive(:list_objects_v2).and_return(response)

      result = described_class.list_keys(organization_id: organization_id)

      expect(result).to contain_exactly(
        "#{organization_id}/2026/01/25/12/abc123.enc",
        "#{organization_id}/2026/01/25/12/def456.enc"
      )
      expect(s3_client).to have_received(:list_objects_v2).with(
        bucket: 'raw-events',
        prefix: "#{organization_id}/",
        max_keys: 1000
      )
    end

    it 'supports custom prefix' do
      response = double(contents: [])
      allow(s3_client).to receive(:list_objects_v2).and_return(response)

      described_class.list_keys(organization_id: organization_id, prefix: '2026/01/')

      expect(s3_client).to have_received(:list_objects_v2).with(
        bucket: 'raw-events',
        prefix: "#{organization_id}/2026/01/",
        max_keys: 1000
      )
    end

    it 'supports limit' do
      response = double(contents: [])
      allow(s3_client).to receive(:list_objects_v2).and_return(response)

      described_class.list_keys(organization_id: organization_id, limit: 50)

      expect(s3_client).to have_received(:list_objects_v2).with(
        bucket: 'raw-events',
        prefix: "#{organization_id}/",
        max_keys: 50
      )
    end
  end

  describe '.metadata' do
    let(:key) { "#{organization_id}/2026/01/25/12/abc123.enc" }

    it 'returns metadata for object' do
      metadata = {
        'organization-id' => organization_id,
        'iv' => 'abc123',
        'auth-tag' => 'def456',
        'created-at' => '2026-01-25T12:00:00Z'
      }
      response = double(metadata: metadata)
      allow(s3_client).to receive(:head_object).and_return(response)

      result = described_class.metadata(key)

      expect(result).to eq(metadata)
    end

    it 'returns nil when object does not exist' do
      allow(s3_client).to receive(:head_object).and_raise(Aws::S3::Errors::NotFound.new(nil, 'Not found'))

      result = described_class.metadata(key)

      expect(result).to be_nil
    end
  end

  describe '.ensure_bucket_exists!' do
    context 'when bucket exists' do
      it 'does nothing' do
        allow(s3_client).to receive(:head_bucket)

        described_class.ensure_bucket_exists!

        expect(s3_client).to have_received(:head_bucket).with(bucket: 'raw-events')
      end
    end

    context 'when bucket does not exist' do
      it 'creates bucket with lifecycle policy' do
        allow(s3_client).to receive(:head_bucket).and_raise(Aws::S3::Errors::NotFound.new(nil, 'Not found'))
        allow(s3_client).to receive(:create_bucket)
        allow(s3_client).to receive(:put_bucket_lifecycle_configuration)

        described_class.ensure_bucket_exists!

        expect(s3_client).to have_received(:create_bucket).with(bucket: 'raw-events')
        expect(s3_client).to have_received(:put_bucket_lifecycle_configuration) do |args|
          expect(args[:bucket]).to eq('raw-events')
          rule = args[:lifecycle_configuration][:rules].first
          expect(rule[:id]).to eq('expire-raw-events')
          expect(rule[:status]).to eq('Enabled')
          expect(rule[:expiration][:days]).to eq(3)
        end
      end
    end
  end

  describe 'encryption' do
    it 'encrypts data so it cannot be read without decryption' do
      allow(s3_client).to receive(:put_object) do |args|
        # The body should be encrypted and not contain the raw payload
        expect(args[:body]).not_to include('Hello world')
        expect(args[:body]).not_to include('claude_code')
      end

      described_class.store(payload, organization_id: organization_id)
    end

    it 'roundtrips data correctly through encrypt/decrypt' do
      stored_data = nil
      stored_metadata = nil

      allow(s3_client).to receive(:put_object) do |args|
        stored_data = args[:body]
        stored_metadata = args[:metadata]
      end

      key = described_class.store(payload, organization_id: organization_id)

      # Now set up fetch to return what was stored
      response = double(
        'S3Response',
        body: StringIO.new(stored_data),
        metadata: stored_metadata
      )
      allow(s3_client).to receive(:get_object).and_return(response)

      result = described_class.fetch(key)

      expect(result).to eq(payload.stringify_keys)
    end
  end

  describe 'configuration' do
    it 'uses environment variables for configuration' do
      allow(ENV).to receive(:fetch).and_call_original
      allow(ENV).to receive(:fetch).with('MINIO_ENDPOINT', anything).and_return('http://minio:9000')
      allow(ENV).to receive(:fetch).with('MINIO_REGION', anything).and_return('us-west-2')
      allow(ENV).to receive(:fetch).with('MINIO_ACCESS_KEY', anything).and_return('mykey')
      allow(ENV).to receive(:fetch).with('MINIO_SECRET_KEY', anything).and_return('mysecret')
      allow(ENV).to receive(:fetch).with('RAW_EVENTS_BUCKET', anything).and_return('custom-bucket')
      allow(ENV).to receive(:fetch).with('RAW_EVENT_ENCRYPTION_KEY', anything).and_return('custom_encryption_key_32_chars_')

      # Clear memoized values
      described_class.instance_variable_set(:@client, nil)
      described_class.instance_variable_set(:@encryption_key, nil)

      expect(Aws::S3::Client).to receive(:new).with(
        endpoint: 'http://minio:9000',
        region: 'us-west-2',
        access_key_id: 'mykey',
        secret_access_key: 'mysecret',
        force_path_style: true
      ).and_return(s3_client)

      allow(s3_client).to receive(:put_object)

      described_class.store(payload, organization_id: organization_id)
    end
  end
end
