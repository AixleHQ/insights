# frozen_string_literal: true

class CreateOrganizationProviderSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_provider_settings, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :provider, null: false
      t.boolean :enabled, null: false, default: true

      t.timestamps
    end

    add_index :organization_provider_settings, [ :organization_id, :provider ],
              unique: true, name: "index_org_provider_settings_on_org_and_provider"
  end
end
