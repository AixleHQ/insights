class AddExternalAccountFieldsToOrganizationConnectors < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_connectors, :external_account_id, :string
    add_column :organization_connectors, :external_account_name, :string
  end
end
