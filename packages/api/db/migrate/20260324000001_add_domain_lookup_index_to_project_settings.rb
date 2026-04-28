class AddDomainLookupIndexToProjectSettings < ActiveRecord::Migration[8.1]
  def change
    add_index :project_settings, :value,
              name: "index_project_settings_on_allowed_email_domain",
              where: "key = 'allowed_email_domain'"
  end
end
