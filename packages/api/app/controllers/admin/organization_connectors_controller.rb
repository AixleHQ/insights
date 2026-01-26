# frozen_string_literal: true

module Admin
  class OrganizationConnectorsController < ApplicationController
    def export
      connectors = OrganizationConnector.includes(:organization).order(created_at: :desc)
      respond_to do |format|
        format.csv do
          send_data generate_csv(connectors), filename: "organization-connectors-#{Date.current}.csv"
        end
      end
    end

    def batch_delete
      ids = params[:ids]
      OrganizationConnector.where(id: ids).destroy_all
      redirect_to admin_organization_connectors_path, notice: "Successfully deleted #{ids.count} connectors."
    end

    def force_sync
      connector = OrganizationConnector.find(params[:id])
      # Queue sync job (implementation depends on connector type)
      # SyncConnectorJob.perform_later(connector.id)
      connector.update!(last_sync_at: nil) # Reset to trigger re-sync
      redirect_to admin_organization_connector_path(connector), notice: 'Sync initiated.'
    end

    def revoke
      connector = OrganizationConnector.find(params[:id])
      connector.update!(is_active: false, access_token: nil, refresh_token: nil)
      redirect_to admin_organization_connector_path(connector), notice: 'Connector access revoked.'
    end

    private

    def generate_csv(connectors)
      require 'csv'
      CSV.generate(headers: true) do |csv|
        csv << %w[id organization_name connector_type is_active last_sync_at created_at]
        connectors.find_each do |connector|
          csv << [connector.id, connector.organization&.name, connector.connector_type, connector.is_active, connector.last_sync_at, connector.created_at]
        end
      end
    end

    def dashboard_class
      OrganizationConnectorDashboard
    end

    def resource_class
      OrganizationConnector
    end

    def resource_name
      'organization_connector'
    end

    def scoped_resource
      resource_class.includes(:organization).order(created_at: :desc)
    end
  end
end
