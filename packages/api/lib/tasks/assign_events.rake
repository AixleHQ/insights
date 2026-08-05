# frozen_string_literal: true

namespace :seed do
  desc "Assign some tool events to a specific user by email"
  task :assign_to_user, [ :email ] => :environment do |_t, args|
    email = args[:email]

    if email.blank?
      puts "Usage: rails seed:assign_to_user[user@example.com]"
      exit 1
    end

    user = User.find_by(email: email)
    unless user
      puts "User not found: #{email}"
      puts "Available users:"
      User.limit(10).pluck(:email).each { |e| puts "  - #{e}" }
      exit 1
    end

    puts "Found user: #{user.name || user.email} (ID: #{user.id})"

    # Get the organization
    org = user.organizations.first
    unless org
      puts "User has no organizations. Creating membership..."
      org = Organization.find_by(slug: "acme-corp")
      if org
        OrganizationMembership.create!(user: user, organization: org, role: "member")
        puts "Added user to organization: #{org.name}"
      else
        puts "No organization found. Run rails db:seed first."
        exit 1
      end
    end

    puts "Organization: #{org.name}"

    # Count existing events for this user
    existing_count = ToolEvent.where(user: user).count
    puts "User currently has #{existing_count} events"

    # Reassign some events from seed users to this user
    seed_users = User.where("email LIKE 'engineer%@example.com'")
    events_to_reassign = ToolEvent.where(user: seed_users, organization: org)
                                   .order("RANDOM()")
                                   .limit(500)

    if events_to_reassign.empty?
      puts "No seed events found to reassign. Make sure you've run rails db:seed first."
      exit 1
    end

    puts "Reassigning #{events_to_reassign.count} events to #{user.email}..."

    # Update events to belong to this user
    events_to_reassign.update_all(user_id: user.id)

    # Also assign user to some projects if not already
    projects = org.projects.limit(3)
    projects.each do |project|
      ProjectMembership.find_or_create_by!(user: user, project: project) do |m|
        m.role = "member"
      end
    end

    new_count = ToolEvent.where(user: user).count
    puts "Done! User now has #{new_count} events"
    puts "User is a member of #{user.projects.count} projects"
  end

  desc "Show user's event summary"
  task :user_summary, [ :email ] => :environment do |_t, args|
    email = args[:email]

    if email.blank?
      puts "Usage: rails seed:user_summary[user@example.com]"
      exit 1
    end

    user = User.find_by(email: email)
    unless user
      puts "User not found: #{email}"
      exit 1
    end

    puts "User: #{user.name || user.email}"
    puts "Organizations: #{user.organizations.pluck(:name).join(', ')}"
    puts "Projects: #{user.projects.pluck(:name).join(', ')}"
    puts ""
    puts "Event Summary:"
    puts "-" * 40

    user.organizations.each do |org|
      events = ToolEvent.where(user: user, organization: org)
      puts "#{org.name}:"
      puts "  Total events: #{events.count}"
      puts "  By tool:"
      events.group(:tool_name).count.each do |tool, count|
        puts "    #{tool}: #{count}"
      end
      puts "  Total cost: $#{events.sum(:cost_usd).round(2)}"
    end
  end
end
