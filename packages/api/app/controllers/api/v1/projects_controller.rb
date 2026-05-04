# frozen_string_literal: true

module Api
  module V1
    class ProjectsController < BaseController
      before_action :set_project, only: %i[show update destroy settings update_setting destroy_setting stats daily_by_tool commits_by_user members retention_policy update_retention_policy link_jira link_linear sync_issues]

      # GET /api/v1/projects
      # GET /api/v1/organizations/:organization_id/projects
      def index
        projects = authorized_scope(Project.all)

        # Scope to organization if provided
        if params[:organization_id].present?
          require_organization!
          projects = projects.where(organization_id: current_organization.id)
        elsif params[:personal] == "true"
          projects = projects.where(owner_id: current_user.id)
        end

        projects = projects.active if params[:active] == "true"
        projects = projects.order(:name)

        render_collection(projects, ProjectSerializer)
      end

      # GET /api/v1/projects/:id
      def show
        authorize! @project
        render_resource(@project, ProjectFullSerializer)
      end

      # POST /api/v1/projects
      # POST /api/v1/organizations/:organization_id/projects
      def create
        @project = Project.new(project_params)

        # Set organization or owner based on context
        if params[:organization_id].present?
          require_organization!
          @project.organization = current_organization
        else
          @project.owner = current_user
        end

        authorize! @project

        Project.transaction do
          @project.save!
          # Add creator as project owner (for org projects)
          if @project.organization_project?
            @project.project_memberships.create!(user: current_user, role: "owner")
          end
        end

        render_created(@project, ProjectSerializer)
      rescue ActiveRecord::RecordInvalid => e
        render json: {
          error: "Unprocessable Entity",
          errors: format_validation_errors(e.record.errors)
        }, status: :unprocessable_content
      end

      # PATCH /api/v1/projects/:id
      def update
        authorize! @project

        if @project.update(project_update_params)
          render_resource(@project, ProjectSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(@project.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/projects/:id
      def destroy
        authorize! @project
        @project.destroy!
        render_no_content
      end

      # GET /api/v1/projects/:id/settings
      def settings
        authorize! @project, to: :settings?
        settings = @project.project_settings.order(:key)
        render json: {
          data: ProjectSettingSerializer.new(settings).serialize
        }
      end

      # PUT /api/v1/projects/:id/settings/:key
      def update_setting
        authorize! @project, to: :settings?

        setting = @project.project_settings.find_or_initialize_by(key: params[:key])
        action = setting.new_record? ? "settings.create" : "settings.update"
        old_value = setting.value
        setting.value = params[:value]

        if setting.save
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: action,
            resource: setting,
            tracked_changes: { key: params[:key], before: old_value, after: setting.value },
            request: request
          )
          render_resource(setting, ProjectSettingSerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(setting.errors)
          }, status: :unprocessable_content
        end
      end

      # DELETE /api/v1/projects/:id/settings/:key
      def destroy_setting
        authorize! @project, to: :settings?

        setting = @project.project_settings.find_by!(key: params[:key])
        setting.destroy!

        ProjectAuditLog.log(
          project: @project,
          actor: current_user,
          action: "settings.delete",
          resource: setting,
          tracked_changes: { key: params[:key], before: setting.value },
          request: request
        )

        render_no_content
      end

      # GET /api/v1/projects/:id/stats
      def stats
        authorize! @project, to: :show?

        days = (params[:days] || 30).to_i
        time_range_start = days.days.ago.beginning_of_day
        time_range_end = Time.current

        events = @project.tool_events.where(occurred_at: time_range_start..time_range_end)

        daily_data = events
          .group("DATE_TRUNC('day', occurred_at)")
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            "COUNT(*) as event_count",
            "SUM(cost_usd) as cost_usd"
          )
          .order("day")
          .map do |row|
            {
              date: row.day&.to_date&.iso8601,
              eventCount: row.event_count,
              costUsd: (row.cost_usd || 0).to_f
            }
          end

        render json: {
          daily: daily_data,
          totalEvents: events.count,
          totalCost: events.sum(:cost_usd).to_f
        }
      end

      # GET /api/v1/projects/:id/stats/daily_by_tool
      def daily_by_tool
        authorize! @project, to: :show?

        days = (params[:days] || 30).to_i
        time_range_start = days.days.ago.beginning_of_day
        time_range_end = Time.current

        events = @project.tool_events.where(occurred_at: time_range_start..time_range_end)

        # Get top tools by total event count
        top_tools = events
          .group(:tool_name)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(3)
          .pluck(:tool_name)

        # Get daily data grouped by date and tool
        daily_tool_data = events
          .group("DATE_TRUNC('day', occurred_at)", :tool_name)
          .select(
            "DATE_TRUNC('day', occurred_at) as day",
            "tool_name",
            "COUNT(*) as event_count"
          )
          .order("day")

        # Transform into chart-friendly format
        date_map = {}
        daily_tool_data.each do |row|
          date = row.day&.to_date&.iso8601
          next unless date

          date_map[date] ||= { date: date }
          tool_key = top_tools.include?(row.tool_name) ? row.tool_name : "Other"
          date_map[date][tool_key] ||= 0
          date_map[date][tool_key] += row.event_count
        end

        render json: {
          data: date_map.values.sort_by { |d| d[:date] },
          tools: top_tools + [ "Other" ]
        }
      end

      # GET /api/v1/projects/:id/stats/commits_by_user
      def commits_by_user
        authorize! @project, to: :show?

        days = (params[:days] || 30).to_i
        since = days.days.ago.beginning_of_day

        rows = @project.tool_events
          .where(event_type: "commit")
          .where(occurred_at: since..)
          .where.not(user_id: nil)
          .group(:user_id)
          .select("user_id, COUNT(*) as commit_count, MAX(occurred_at) as last_commit_at")

        user_ids = rows.map(&:user_id)
        users_by_id = User.where(id: user_ids).index_by(&:id)

        data = rows.map do |row|
          user = users_by_id[row.user_id]
          {
            userId: row.user_id,
            name: user&.name,
            email: user&.email,
            avatarUrl: user&.avatar_url,
            commitCount: row.commit_count,
            lastCommitAt: row.last_commit_at&.iso8601
          }
        end.sort_by { |d| -d[:commitCount] }

        paged = paginate(Kaminari.paginate_array(data))
        render json: { data: paged, meta: pagination_meta(paged) }
      end

      # GET /api/v1/projects/:id/members
      def members
        authorize! @project, to: :show?

        project_members = @project.project_memberships.includes(:user)
        project_members = project_members.where(role: params[:role]) if params[:role].present?

        members_data = project_members.map do |pm|
          user = pm.user
          {
            id: pm.id,
            userId: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatar_url,
            role: pm.role,
            joinedAt: pm.created_at.iso8601
          }
        end

        render json: { data: members_data }
      end

      # POST /api/v1/projects/:id/link_jira
      def link_jira
        authorize! @project, to: :link_jira?

        connector_id     = params.require(:connector_id)
        jira_project_key = params.require(:jira_project_key)

        unless jira_project_key.match?(/\A[A-Z][A-Z0-9_]{1,9}\z/)
          return render json: { error: "Invalid Jira project key format" }, status: :unprocessable_content
        end

        # Verify connector belongs to the same org as the project (prevents cross-org injection)
        connector = @project.organization.organization_connectors.find(connector_id)

        ApplicationRecord.transaction do
          @project.project_settings.find_or_initialize_by(key: "jira_connector_id").update!(value: connector.id.to_s)
          @project.project_settings.find_or_initialize_by(key: "jira_project_key").update!(value: jira_project_key)
          @project.project_settings.where(key: %w[linear_connector_id linear_project_id linear_project_name]).destroy_all
        end

        render json: { data: { linked: true } }
      end

      # POST /api/v1/projects/:id/link_linear
      def link_linear
        authorize! @project, to: :link_linear?

        connector_id = params.require(:connector_id)
        linear_project_id = params.require(:linear_project_id)
        linear_project_name = params.require(:linear_project_name)

        connector = @project.organization.organization_connectors.find(connector_id)
        if connector.connector_type != "linear"
          return render json: { error: "Connector must be a Linear integration" }, status: :unprocessable_content
        end

        ApplicationRecord.transaction do
          @project.project_settings.find_or_initialize_by(key: "linear_connector_id").update!(value: connector.id.to_s)
          @project.project_settings.find_or_initialize_by(key: "linear_project_id").update!(value: linear_project_id)
          @project.project_settings.find_or_initialize_by(key: "linear_project_name").update!(value: linear_project_name)
          @project.project_settings.where(key: %w[jira_connector_id jira_project_key]).destroy_all
        end

        render json: { data: { linked: true } }
      end

      # POST /api/v1/projects/:id/sync_issues
      # Enqueues the issue sync job and returns 202 immediately. Clients should
      # poll the connector's last_synced_at to detect when the sync completes.
      def sync_issues
        authorize! @project, to: :update?

        jira_connector_id = @project.project_settings.find_by(key: "jira_connector_id")&.value
        linear_connector_id = @project.project_settings.find_by(key: "linear_connector_id")&.value
        connector_id = jira_connector_id.presence || linear_connector_id.presence
        return render json: { error: "No issue provider linked" }, status: :unprocessable_content if connector_id.blank?

        connector = @project.organization.organization_connectors.find(connector_id)
        case connector.connector_type
        when "jira"
          JiraSyncJob.perform_later(connector.id, "sync", project_id: @project.id)
        when "linear"
          LinearSyncJob.perform_later(connector.id, "sync", project_id: @project.id)
        else
          return render json: { error: "Unsupported issue provider" }, status: :unprocessable_content
        end

        render json: { data: { queued: true } }, status: :accepted
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Connector not found" }, status: :not_found
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_content
      end

      # GET /api/v1/projects/:id/retention_policy
      def retention_policy
        authorize! @project, to: :retention_policy?
        policy = @project.retention_policy || @project.create_retention_policy!
        render_resource(policy, ProjectRetentionPolicySerializer)
      end

      # PATCH /api/v1/projects/:id/retention_policy
      def update_retention_policy
        authorize! @project, to: :retention_policy?

        return render_resource(@project.retention_policy || @project.create_retention_policy!, ProjectRetentionPolicySerializer) if retention_policy_params.empty?

        policy = @project.retention_policy || @project.build_retention_policy
        changes_before = policy.attributes.slice(*retention_policy_params.keys)

        policy.updated_by = current_user
        if policy.update(retention_policy_params)
          ProjectAuditLog.log(
            project: @project,
            actor: current_user,
            action: "settings.update",
            resource: policy,
            tracked_changes: { before: changes_before, after: policy.attributes.slice(*retention_policy_params.keys) },
            request: request
          )
          render_resource(policy, ProjectRetentionPolicySerializer)
        else
          render json: {
            error: "Unprocessable Entity",
            errors: format_validation_errors(policy.errors)
          }, status: :unprocessable_content
        end
      end

      private

      def set_project
        @project = Project.includes(:retention_policy, :project_settings).find(params[:id])
      end

      def project_params
        params.permit(:name, :slug, :description, :repository_url, :git_remote_url, :is_active)
      end

      def project_update_params
        params.permit(:name, :slug, :description, :repository_url, :git_remote_url, :is_active)
      end

      def retention_policy_params
        params.permit(:raw_event_ttl, :tool_events_retention, :hourly_aggregate_retention,
                      :daily_aggregate_retention, :retention_reason)
      end
    end
  end
end
