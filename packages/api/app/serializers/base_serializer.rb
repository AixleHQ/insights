# frozen_string_literal: true

class BaseSerializer
  include Alba::Resource

  # Transform keys to camelCase
  transform_keys :lower_camel

  # Common timestamp attributes
  def self.timestamps
    attribute :created_at do |resource|
      resource.created_at&.iso8601
    end

    attribute :updated_at do |resource|
      resource.updated_at&.iso8601
    end
  end

  # Helper for nullable datetime
  def self.datetime_attribute(name)
    attribute name do |resource|
      resource.public_send(name)&.iso8601
    end
  end

  # Helper for conditional attributes based on context
  def self.conditional_attribute(name, condition_method)
    attribute name, if: condition_method
  end

  # Serialize a single resource
  def serialize
    serializable_hash
  end
end
