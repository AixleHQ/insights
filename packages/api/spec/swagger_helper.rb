# frozen_string_literal: true

require 'rails_helper'

RSpec.configure do |config|
  # Specify a root folder where Swagger JSON files are generated
  config.openapi_root = Rails.root.join('swagger').to_s

  # Define one or more Swagger documents and provide global metadata for each one
  config.openapi_specs = {
    'v1/swagger.yaml' => {
      openapi: '3.0.1',
      info: {
        title: 'Aixle Insights API V1',
        version: 'v1',
        description: 'API for Aixle Insights - Developer Tooling Platform',
        contact: {
          name: 'Aixle Insights Team'
        }
      },
      paths: {},
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Development server'
        },
        {
          url: 'https://insights.example.com',
          description: 'Production server'
        }
      ],
      components: {
        securitySchemes: {
          bearer_auth: {
            type: :http,
            scheme: :bearer,
            bearerFormat: :JWT,
            description: 'JWT token from Keycloak authentication'
          }
        },
        schemas: {
          Error: {
            type: :object,
            properties: {
              error: { type: :string },
              message: { type: :string }
            },
            required: %w[error]
          },
          ValidationError: {
            type: :object,
            properties: {
              error: { type: :string },
              errors: {
                type: :object,
                additionalProperties: {
                  type: :array,
                  items: { type: :string }
                }
              }
            },
            required: %w[error errors]
          },
          PaginationMeta: {
            type: :object,
            properties: {
              currentPage: { type: :integer },
              totalPages: { type: :integer },
              totalCount: { type: :integer },
              perPage: { type: :integer }
            },
            required: %w[currentPage totalPages totalCount perPage]
          },
          User: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              email: { type: :string, format: :email },
              name: { type: :string, nullable: true },
              avatarUrl: { type: :string, nullable: true },
              globalAdmin: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id email globalAdmin createdAt updatedAt]
          },
          Organization: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              slug: { type: :string },
              description: { type: :string, nullable: true },
              isActive: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id name slug isActive createdAt updatedAt]
          },
          OrganizationMembership: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              organizationId: { type: :string, format: :uuid },
              role: { type: :string, enum: %w[owner member viewer] },
              user: { '$ref' => '#/components/schemas/UserMinimal' },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id organizationId role user createdAt updatedAt]
          },
          OrganizationConnector: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              organizationId: { type: :string, format: :uuid },
              connectorType: { type: :string, enum: %w[github gitlab bitbucket jira linear openrouter anthropic openai gemini] },
              isActive: { type: :boolean },
              externalAccountId: { type: :string, nullable: true },
              externalAccountName: { type: :string, nullable: true },
              lastSyncAt: { type: :string, format: 'date-time', nullable: true },
              lastError: { type: :string, nullable: true },
              tokenExpired: { type: :boolean },
              sourceControl: { type: :boolean },
              projectManagement: { type: :boolean },
              aiProvider: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id organizationId connectorType isActive createdAt updatedAt]
          },
          Project: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              slug: { type: :string },
              description: { type: :string, nullable: true },
              isActive: { type: :boolean },
              organizationId: { type: :string, format: :uuid, nullable: true },
              ownerId: { type: :string, format: :uuid, nullable: true },
              isPersonal: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id name slug isActive isPersonal createdAt updatedAt]
          },
          Repository: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              projectId: { type: :string, format: :uuid },
              organizationConnectorId: { type: :string, format: :uuid },
              externalId: { type: :string },
              name: { type: :string },
              fullName: { type: :string },
              description: { type: :string, nullable: true },
              defaultBranch: { type: :string, nullable: true },
              cloneUrl: { type: :string, nullable: true },
              htmlUrl: { type: :string, nullable: true },
              isPrivate: { type: :boolean },
              provider: { type: :string },
              lastSyncAt: { type: :string, format: 'date-time', nullable: true },
              needsSync: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id projectId organizationConnectorId externalId name fullName isPrivate provider createdAt updatedAt]
          },
          UserMinimal: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              email: { type: :string, format: :email },
              name: { type: :string, nullable: true },
              avatarUrl: { type: :string, nullable: true }
            },
            required: %w[id email]
          },
          OrganizationRetentionPolicy: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              organizationId: { type: :string, format: :uuid },
              retentionDays: { type: :integer },
              autoDeleteEvents: { type: :boolean },
              anonymizeAfterRetention: { type: :boolean },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id organizationId retentionDays autoDeleteEvents anonymizeAfterRetention createdAt updatedAt]
          },
          Setting: {
            type: :object,
            properties: {
              id: { type: :string, format: :uuid },
              key: { type: :string },
              value: { type: :object },
              createdAt: { type: :string, format: 'date-time' },
              updatedAt: { type: :string, format: 'date-time' }
            },
            required: %w[id key value createdAt updatedAt]
          }
        }
      },
      security: [
        { bearer_auth: [] }
      ]
    }
  }

  # Specify the format of the output Swagger file when running 'rswag:specs:swaggerize'.
  # The openapi_specs configuration option has the filename including format in
  # the key, this parameter is only used when the key does not include a format.
  config.openapi_format = :yaml
end
