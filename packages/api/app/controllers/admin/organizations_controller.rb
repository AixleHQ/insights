# frozen_string_literal: true

module Admin
  class OrganizationsController < Admin::ApplicationController
    def export
      organizations = Organization.all
      respond_to do |format|
        format.csv do
          send_data generate_csv(organizations), filename: "organizations-#{Date.current}.csv"
        end
      end
    end

    def batch_delete
      ids = params[:ids]
      Organization.where(id: ids).destroy_all
      redirect_to admin_organizations_path, notice: "Successfully deleted #{ids.count} organizations."
    end

    private

    def generate_csv(organizations)
      require "csv"
      CSV.generate(headers: true) do |csv|
        csv << %w[id name slug is_active member_count created_at]
        organizations.find_each do |org|
          csv << [ org.id, org.name, org.slug, org.is_active, org.members.count, org.created_at ]
        end
      end
    end
  end
end
