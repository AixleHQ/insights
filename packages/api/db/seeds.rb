# This file contains seed data for development and testing
# Run with: rails db:seed

puts "Seeding database..."

# Create a default sanitization policy
if SanitizationPolicy.count == 0
  puts "Creating default sanitization policy..."
  SanitizationPolicy.create!(
    version: 1,
    name: 'Default Policy',
    classification_rules: {
      patterns: [
        { name: 'api_key', regex: '(?i)(api[_-]?key|apikey)["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_-]{20,}' },
        { name: 'aws_secret', regex: '(?i)aws[_-]?secret[_-]?access[_-]?key["\']?\s*[:=]\s*["\']?[A-Za-z0-9/+=]{40}' },
        { name: 'private_key', regex: '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' },
        { name: 'email', regex: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' },
        { name: 'phone', regex: '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b' },
        { name: 'ssn', regex: '\b\d{3}-\d{2}-\d{4}\b' }
      ]
    },
    sanitization_rules: {
      actions: [
        { pattern: 'api_key', action: 'redact', replacement: '[REDACTED_API_KEY]' },
        { pattern: 'aws_secret', action: 'redact', replacement: '[REDACTED_AWS_SECRET]' },
        { pattern: 'private_key', action: 'redact', replacement: '[REDACTED_PRIVATE_KEY]' },
        { pattern: 'email', action: 'mask', mask_char: '*', visible_chars: 3 },
        { pattern: 'phone', action: 'redact', replacement: '[REDACTED_PHONE]' },
        { pattern: 'ssn', action: 'redact', replacement: '[REDACTED_SSN]' }
      ]
    },
    is_active: true,
    effective_at: Time.current
  )
end

# Only seed sample data in development
if Rails.env.development?
  puts "Seeding development data..."

  # Create sample users
  admin_user = User.find_or_create_by!(email: 'admin@db90.dev') do |user|
    user.keycloak_sub = 'dev-admin-001'
    user.name = 'Admin User'
    user.global_admin = true
  end

  dev_user = User.find_or_create_by!(email: 'developer@db90.dev') do |user|
    user.keycloak_sub = 'dev-user-001'
    user.name = 'Dev User'
  end

  viewer_user = User.find_or_create_by!(email: 'viewer@db90.dev') do |user|
    user.keycloak_sub = 'dev-user-002'
    user.name = 'Viewer User'
  end

  puts "Created #{User.count} users"

  # Create sample organization
  org = Organization.find_or_create_by!(slug: 'acme-corp') do |o|
    o.name = 'Acme Corporation'
  end

  puts "Created organization: #{org.name}"

  # Add users to organization
  OrganizationMembership.find_or_create_by!(user: admin_user, organization: org) do |m|
    m.role = 'owner'
  end

  OrganizationMembership.find_or_create_by!(user: dev_user, organization: org) do |m|
    m.role = 'member'
  end

  OrganizationMembership.find_or_create_by!(user: viewer_user, organization: org) do |m|
    m.role = 'viewer'
  end

  puts "Added #{org.members.count} members to #{org.name}"

  # Create sample connectors
  github_connector = OrganizationConnector.find_or_create_by!(
    organization: org,
    connector_type: 'github'
  ) do |c|
    c.access_token = 'sample_github_token_do_not_use'
    c.is_active = true
  end

  puts "Created GitHub connector"

  # Create sample projects
  main_project = Project.find_or_create_by!(organization: org, slug: 'main-api') do |p|
    p.name = 'Main API'
    p.description = 'The main backend API service'
  end

  frontend_project = Project.find_or_create_by!(organization: org, slug: 'web-frontend') do |p|
    p.name = 'Web Frontend'
    p.description = 'React web application'
  end

  puts "Created #{org.projects.count} projects"

  # Add members to projects
  ProjectMembership.find_or_create_by!(user: admin_user, project: main_project) do |m|
    m.role = 'owner'
  end

  ProjectMembership.find_or_create_by!(user: dev_user, project: main_project) do |m|
    m.role = 'member'
  end

  ProjectMembership.find_or_create_by!(user: dev_user, project: frontend_project) do |m|
    m.role = 'owner'
  end

  # Create sample repositories
  Repository.find_or_create_by!(
    project: main_project,
    organization_connector: github_connector,
    external_id: 'repo-123456'
  ) do |r|
    r.name = 'acme-api'
    r.full_name = 'acme-corp/acme-api'
    r.url = 'https://github.com/acme-corp/acme-api'
    r.default_branch = 'main'
  end

  Repository.find_or_create_by!(
    project: frontend_project,
    organization_connector: github_connector,
    external_id: 'repo-789012'
  ) do |r|
    r.name = 'acme-web'
    r.full_name = 'acme-corp/acme-web'
    r.url = 'https://github.com/acme-corp/acme-web'
    r.default_branch = 'main'
  end

  puts "Created #{Repository.count} repositories"

  # Create sample tool events for the past 7 days
  puts "Creating sample tool events..."

  tools = %w[claude_code cursor github_copilot]
  event_types = %w[chat completion edit]
  models = ['claude-3-opus', 'claude-3-sonnet', 'gpt-4', 'gpt-4-turbo']

  7.times do |day_offset|
    date = day_offset.days.ago.beginning_of_day

    # Random number of events per day (10-50)
    rand(10..50).times do
      ToolEvent.create!(
        user: [admin_user, dev_user].sample,
        organization: org,
        project: [main_project, frontend_project, nil].sample,
        tool_name: tools.sample,
        event_type: event_types.sample,
        model: models.sample,
        tokens_in: rand(50..500),
        tokens_out: rand(100..2000),
        cost_usd: rand(0.001..0.05).round(6),
        occurred_at: date + rand(0..86400).seconds
      )
    end
  end

  puts "Created #{ToolEvent.count} tool events"

  # Create some organization settings
  OrganizationSetting.set(org, 'default_retention_days', '90')
  OrganizationSetting.set(org, 'notification_email', 'alerts@acme.dev')
  OrganizationSetting.set(org, 'allow_external_tools', 'true')

  puts "Created organization settings"

  # Create user settings
  UserSetting.set(admin_user, 'theme', 'dark')
  UserSetting.set(admin_user, 'notifications_enabled', 'true')
  UserSetting.set(dev_user, 'theme', 'light')

  puts "Created user settings"

  # Create admin audit log entries
  AdminAuditLog.log_action(
    admin_user: admin_user,
    action: 'organizations#update',
    resource: org,
    tracked_changes: { name: ['Old Name', 'Acme Corporation'] },
    metadata: { reason: 'Rebranding' }
  )

  puts "Created admin audit logs"

  puts "\n=== Seed Data Summary ==="
  puts "Users: #{User.count}"
  puts "Organizations: #{Organization.count}"
  puts "Organization Memberships: #{OrganizationMembership.count}"
  puts "Projects: #{Project.count}"
  puts "Repositories: #{Repository.count}"
  puts "Tool Events: #{ToolEvent.count}"
  puts "Sanitization Policies: #{SanitizationPolicy.count}"
end

puts "Seeding complete!"
