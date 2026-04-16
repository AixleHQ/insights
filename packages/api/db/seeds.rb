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

# Create known development users that should persist across reseeds
# These users authenticate via Keycloak and need to exist with their keycloak_sub
KNOWN_DEV_USERS = [
  {
    email: 'ada.lovelace@example.com',
    name: 'Ada Lovelace',
    keycloak_sub: 'ada.lovelace@example.com',
    global_admin: true,
    org_role: 'owner'
  },
  {
    email: 'alan.turing@example.com',
    name: 'Alan Turing',
    keycloak_sub: 'alan.turing@example.com',
    global_admin: true,
    org_role: 'admin'
  },
  {
    email: 'grace.hopper@example.com',
    name: 'Grace Hopper',
    keycloak_sub: 'grace.hopper@example.com',
    global_admin: true,
    org_role: 'admin'
  }
].freeze

# Only seed sample data in development
if Rails.env.development? || Rails.env.staging?
  puts "Seeding development data with realistic usage simulation..."
  puts "This simulates 100 engineers over 45 days"

  # Configuration for realistic seed
  NUM_ENGINEERS = 100
  NUM_DAYS = 45
  # Keep total events manageable (~50k max) while being realistic
  EVENTS_PER_ACTIVE_USER_PER_DAY = (5..30) # Range of events per active engineer per day
  ACTIVE_USER_PERCENTAGE = 0.7 # 70% of users are active on any given day
  WEEKEND_REDUCTION = 0.3 # 30% of weekday activity on weekends

  # Realistic first and last names for engineers
  first_names = %w[
    James John Robert Michael William David Richard Joseph Thomas Charles
    Christopher Daniel Matthew Anthony Mark Donald Steven Paul Andrew Joshua
    Mary Patricia Jennifer Linda Barbara Elizabeth Susan Jessica Sarah Karen
    Nancy Lisa Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle
    Alex Jordan Taylor Morgan Casey Riley Quinn Blake Jamie Avery
  ]

  last_names = %w[
    Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez
    Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin
    Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson
    Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green
    Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts
  ]

  # Tool configurations with realistic usage patterns
  # Valid tool_names: claude_code, cursor, windsurf, github_copilot, aider, continue, cody, tabnine, amazon_q, openrouter, anthropic_api, openai_api, gemini_api, custom
  # Valid event_types: chat, completion, edit, commit, review, test, debug, refactor, documentation, other
  TOOL_CONFIGS = {
    'github_copilot' => {
      weight: 0.40, # 40% of events
      event_types: %w[completion edit refactor],
      models: %w[gpt-4o gpt-4-turbo copilot-codex],
      avg_tokens_in: 150,
      avg_tokens_out: 100,
      avg_cost: 0.003
    },
    'cursor' => {
      weight: 0.30, # 30% of events
      event_types: %w[completion chat edit refactor debug],
      models: %w[claude-3-5-sonnet gpt-4o cursor-small],
      avg_tokens_in: 500,
      avg_tokens_out: 800,
      avg_cost: 0.012
    },
    'claude_code' => {
      weight: 0.15, # 15% of events
      event_types: %w[chat edit completion commit review test debug refactor],
      models: %w[claude-sonnet-4 claude-opus-4 claude-3-5-sonnet],
      avg_tokens_in: 2000,
      avg_tokens_out: 3000,
      avg_cost: 0.045
    },
    'windsurf' => {
      weight: 0.08, # 8% of events
      event_types: %w[chat completion edit],
      models: %w[claude-3-5-sonnet gpt-4o],
      avg_tokens_in: 600,
      avg_tokens_out: 900,
      avg_cost: 0.015
    },
    'cody' => {
      weight: 0.05, # 5% of events
      event_types: %w[chat completion documentation],
      models: %w[claude-3-5-sonnet gpt-4o],
      avg_tokens_in: 400,
      avg_tokens_out: 600,
      avg_cost: 0.01
    },
    'aider' => {
      weight: 0.02, # 2% of events
      event_types: %w[chat edit commit refactor],
      models: %w[claude-3-5-sonnet gpt-4o claude-opus-4],
      avg_tokens_in: 1500,
      avg_tokens_out: 2000,
      avg_cost: 0.035
    }
  }

  # Project templates
  PROJECT_TEMPLATES = [
    { name: 'Platform API', desc: 'Core backend API services', weight: 0.25 },
    { name: 'Web Dashboard', desc: 'React/Next.js frontend application', weight: 0.20 },
    { name: 'Mobile App', desc: 'React Native mobile application', weight: 0.15 },
    { name: 'Data Pipeline', desc: 'ETL and data processing services', weight: 0.15 },
    { name: 'ML Services', desc: 'Machine learning models and inference', weight: 0.10 },
    { name: 'DevOps', desc: 'Infrastructure and CI/CD automation', weight: 0.10 },
    { name: 'Documentation', desc: 'Technical docs and guides', weight: 0.05 }
  ]

  # Duration distribution (in milliseconds)
  DURATION_RANGES = {
    'fast' => (100..500),
    'medium' => (500..2000),
    'slow' => (2000..10000)
  }

  # Helper to select weighted random item
  def weighted_sample(items_with_weights)
    total = items_with_weights.values.sum
    r = rand * total
    items_with_weights.each do |item, weight|
      r -= weight
      return item if r <= 0
    end
    items_with_weights.keys.first
  end

  # Create organization
  org = Organization.find_or_create_by!(slug: 'dualboot-partners') do |o|
    o.name = 'Acme Corp'
  end
  puts "Organization: #{org.name}"

  # Create known development users first (so they get events)
  puts "Creating known development users..."
  known_users = []
  KNOWN_DEV_USERS.each do |user_data|
    user = User.find_or_create_by!(email: user_data[:email]) do |u|
      u.keycloak_sub = user_data[:keycloak_sub]
      u.name = user_data[:name]
      u.global_admin = user_data[:global_admin] || false
    end

    # Update keycloak_sub if it changed (in case user logged in with different sub)
    user.update!(keycloak_sub: user_data[:keycloak_sub]) if user.keycloak_sub != user_data[:keycloak_sub]

    # Add to organization with specified role
    OrganizationMembership.find_or_create_by!(user: user, organization: org) do |m|
      m.role = user_data[:org_role] || 'member'
    end

    known_users << user
    puts "  Created/updated: #{user.email} (#{user_data[:org_role]})"
  end

  # Create 100 engineers
  puts "Creating #{NUM_ENGINEERS} engineers..."
  engineers = []

  NUM_ENGINEERS.times do |i|
    email = "engineer#{i + 1}@example.com"
    name = "#{first_names.sample} #{last_names.sample}"

    user = User.find_or_create_by!(email: email) do |u|
      u.keycloak_sub = "seed-user-#{SecureRandom.uuid}"
      u.name = name
      u.global_admin = (i == 0) # First user is admin
    end

    # Assign role based on position
    role = case i
    when 0 then 'owner'
    when 1..4 then 'admin'
    else 'member'
    end

    OrganizationMembership.find_or_create_by!(user: user, organization: org) do |m|
      m.role = role
    end

    engineers << user
  end
  puts "Created #{engineers.count} engineers"

  # Create projects
  puts "Creating projects..."
  projects = PROJECT_TEMPLATES.map do |template|
    slug = template[:name].downcase.gsub(/\s+/, '-')
    Project.find_or_create_by!(organization: org, slug: slug) do |p|
      p.name = template[:name]
      p.description = template[:desc]
    end
  end
  puts "Created #{projects.count} projects"

  # Assign engineers to projects (each engineer works on 2-4 projects)
  engineers.each do |engineer|
    num_projects = rand(2..4)
    engineer_projects = projects.sample(num_projects)

    engineer_projects.each_with_index do |project, idx|
      ProjectMembership.find_or_create_by!(user: engineer, project: project) do |m|
        m.role = idx == 0 ? 'member' : 'viewer'
      end
    end
  end
  puts "Assigned engineers to projects"

  # Create GitHub connector
  github_connector = OrganizationConnector.find_or_create_by!(
    organization: org,
    connector_type: 'github'
  ) do |c|
    c.access_token = 'ghp_simulated_token_for_development_only'
    c.is_active = true
    c.config = { organization: 'dualboot-partners' }
  end

  # Create repositories for projects
  projects.each_with_index do |project, idx|
    Repository.find_or_create_by!(
      project: project,
      organization_connector: github_connector,
      external_id: "repo-#{100000 + idx}"
    ) do |r|
      repo_name = project.slug
      r.name = repo_name
      r.full_name = "dualboot-partners/#{repo_name}"
      r.url = "https://github.com/dualboot-partners/#{repo_name}"
      r.default_branch = 'main'
    end
  end
  puts "Created repositories"

  # Generate tool events for the past NUM_DAYS days
  puts "Generating tool events for #{NUM_DAYS} days..."
  puts "This may take a moment..."

  total_events = 0
  tool_weights = TOOL_CONFIGS.transform_values { |c| c[:weight] }

  NUM_DAYS.times do |day_offset|
    date = day_offset.days.ago.to_date
    is_weekend = date.saturday? || date.sunday?
    activity_modifier = is_weekend ? WEEKEND_REDUCTION : 1.0

    # Determine active users for this day
    num_active = (NUM_ENGINEERS * ACTIVE_USER_PERCENTAGE * activity_modifier).round
    active_engineers = engineers.sample(num_active)

    active_engineers.each do |engineer|
      # Each active engineer generates some events
      num_events = rand(EVENTS_PER_ACTIVE_USER_PER_DAY) * activity_modifier
      num_events = num_events.round

      next if num_events == 0

      # Get engineer's projects
      engineer_projects = engineer.projects.to_a
      engineer_projects << nil # Allow some events without project

      num_events.times do
        tool_name = weighted_sample(tool_weights)
        config = TOOL_CONFIGS[tool_name]

        # Vary tokens with some randomness around the average
        tokens_in = (config[:avg_tokens_in] * rand(0.3..2.5)).round
        tokens_out = (config[:avg_tokens_out] * rand(0.3..2.5)).round
        cost = (config[:avg_cost] * rand(0.5..2.0)).round(6)

        duration_range = DURATION_RANGES.values.sample
        duration_ms = rand(duration_range)

        ToolEvent.create!(
          user: engineer,
          organization: org,
          project: engineer_projects.sample,
          tool_name: tool_name,
          event_type: config[:event_types].sample,
          model: config[:models].sample,
          tokens_in: tokens_in,
          tokens_out: tokens_out,
          cost_usd: cost,
          duration_ms: duration_ms,
          occurred_at: date.to_time + rand(8..20).hours + rand(0..3600).seconds
        )
        total_events += 1
      end
    end

    # Progress indicator
    if (day_offset + 1) % 10 == 0
      puts "  Processed #{day_offset + 1}/#{NUM_DAYS} days (#{total_events} events so far)"
    end
  end
  puts "Created #{total_events} tool events"

  # Create organization settings
  OrganizationSetting.set(org, 'alert_cost_daily', '500')
  OrganizationSetting.set(org, 'alert_cost_monthly', '5000')
  OrganizationSetting.set(org, 'alert_risk_critical', 'true')
  OrganizationSetting.set(org, 'alert_risk_high', 'true')
  OrganizationSetting.set(org, 'alert_usage_spike', 'true')
  OrganizationSetting.set(org, 'alert_email', 'true')
  OrganizationSetting.set(org, 'sanitize_api_keys', 'true')
  OrganizationSetting.set(org, 'sanitize_secrets', 'true')
  puts "Created organization settings"

  # Create some user settings
  engineers.first(10).each do |engineer|
    UserSetting.set(engineer, 'theme', %w[dark light system].sample)
    UserSetting.set(engineer, 'notifications_enabled', 'true')
  end
  puts "Created user settings"

  # Calculate stats
  total_cost = ToolEvent.sum(:cost_usd)
  avg_daily_cost = total_cost / NUM_DAYS

  puts "\n" + "=" * 50
  puts "=== Realistic Seed Data Summary ==="
  puts "=" * 50
  puts "Users: #{User.count}"
  puts "Organizations: #{Organization.count}"
  puts "Organization Memberships: #{OrganizationMembership.count}"
  puts "Projects: #{Project.count}"
  puts "Project Memberships: #{ProjectMembership.count}"
  puts "Repositories: #{Repository.count}"
  puts "Tool Events: #{ToolEvent.count}"
  puts ""
  puts "=== Usage Statistics ==="
  puts "Days of data: #{NUM_DAYS}"
  puts "Total API Cost: $#{total_cost.round(2)}"
  puts "Avg Daily Cost: $#{avg_daily_cost.round(2)}"
  puts "Events by tool:"
  ToolEvent.group(:tool_name).count.each do |tool, count|
    pct = (count.to_f / ToolEvent.count * 100).round(1)
    puts "  #{tool}: #{count} (#{pct}%)"
  end
  puts ""
  puts "Model distribution:"
  ToolEvent.group(:model).count.sort_by { |_, count| -count }.first(10).each do |model, count|
    pct = (count.to_f / ToolEvent.count * 100).round(1)
    puts "  #{model}: #{count} (#{pct}%)"
  end
  puts "=" * 50
end

# Assign events to known dev users (these should have substantial data)
org = Organization.find_by(slug: 'dualboot-partners')
if org && KNOWN_DEV_USERS.any?
  puts "\nGenerating events for known development users..."

  KNOWN_DEV_USERS.each do |user_data|
    user = User.find_by(email: user_data[:email])
    next unless user

    # Assign this user to all projects as a member or admin
    org.projects.each do |project|
      ProjectMembership.find_or_create_by!(user: user, project: project) do |m|
        m.role = user_data[:org_role] == 'owner' ? 'admin' : 'member'
      end
    end

    # Reassign 1500 random events to this user (more than default engineers)
    engineer_ids = User.where("email LIKE 'engineer%'").pluck(:id)
    events_to_reassign = ToolEvent.where(organization: org)
                                   .where(user_id: engineer_ids)
                                   .order(Arel.sql("RANDOM()"))
                                   .limit(1500)

    count = events_to_reassign.update_all(user_id: user.id)
    puts "  #{user.email}: assigned #{count} events, added to #{org.projects.count} projects"

    # Create some tool accounts for this user
    membership = user.organization_memberships.find_by(organization: org)
    if membership
      %w[claude_code cursor github_copilot].each do |tool|
        UserToolAccount.find_or_create_by!(
          organization_membership: membership,
          tool_name: tool
        ) do |ta|
          ta.external_user_id = "#{user.email.split('@').first}-#{tool}"
          ta.external_username = user.email.split('@').first
          ta.is_active = true
        end
      end
      puts "  #{user.email}: created tool accounts"
    end
  end
end

# Also handle any other real users that might exist (logged in before reseed)
real_users = User.where("email LIKE '%example.com' AND email NOT LIKE 'engineer%@%'")
                 .where.not(email: KNOWN_DEV_USERS.map { |u| u[:email] })
                 .joins(:organization_memberships)
                 .where(organization_memberships: { organization_id: org&.id })
                 .distinct

if real_users.any?
  puts "\nAssigning events to #{real_users.count} other real user(s)..."
  real_users.each do |user|
    events_to_reassign = ToolEvent.where(organization: org)
                                   .where("user_id IN (?)", User.where("email LIKE 'engineer%'").pluck(:id))
                                   .order(Arel.sql("RANDOM()"))
                                   .limit(500)

    count = events_to_reassign.update_all(user_id: user.id)
    puts "  #{user.email}: assigned #{count} events"

    org&.projects&.limit(3)&.each do |project|
      ProjectMembership.find_or_create_by!(user: user, project: project) do |m|
        m.role = 'member'
      end
    end
  end
end

puts "Seeding complete!"
