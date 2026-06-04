# frozen_string_literal: true

module Api
  module V1
    class ProjectsController < BaseController
      before_action :set_project, only: %i[show update destroy settings update_setting destroy_setting stats daily_by_tool commits_by_user retention_policy update_retention_policy link_jira link_linear sync_issues favorite unfavorite]

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

        render_collection(
          projects,
          ProjectSerializer,
          serializer_params: ->(paginated) {
            {
              project_aggregate_stats: ProjectToolEventAggregates.for_project_ids(
                paginated.map(&:id),
                **aggregate_scope_for_projects(paginated)
              )
            }
          }
        )
      end

      # GET /api/v1/projects/:id
      def show
        authorize! @project
        stats = ProjectToolEventAggregates.for_project_ids(
          [ @project.id ],
          **aggregate_scope_for_project(@project)
        )
        render_resource(@project, ProjectFullSerializer, serializer_params: { project_aggregate_stats: stats })
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
          log_project_created!
        end

        stats = ProjectToolEventAggregates.for_project_ids(
          [ @project.id ],
          **aggregate_scope_for_project(@project)
        )
        render_created(@project, ProjectSerializer, serializer_params: { project_aggregate_stats: stats })
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
          stats = ProjectToolEventAggregates.for_project_ids(
            [ @project.id ],
            **aggregate_scope_for_project(@project)
          )
          render_resource(@project, ProjectSerializer, serializer_params: { project_aggregate_stats: stats })
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
        ApplicationRecord.transaction do
          log_project_deleted!
          @project.destroy!
        end
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

        prev_start = (2 * days).days.ago.beginning_of_day
        prev_end   = time_range_start

        curr_count, curr_cost = events.pick(
          Arel.sql("COUNT(*)"), Arel.sql("COALESCE(SUM(cost_usd), 0)")
        )
        prev_count, prev_cost = @project.tool_events
          .where(occurred_at: prev_start...prev_end)
          .pick(Arel.sql("COUNT(*)"), Arel.sql("COALESCE(SUM(cost_usd), 0)"))

        render json: {
          daily: daily_data,
          totalEvents: curr_count,
          totalCost: curr_cost.to_f,
          previousPeriod: {
            totalEvents: prev_count,
            totalCost: prev_cost.to_f
          }
        }
      end

      # GET /api/v1/projects/:id/stats/daily_by_tool
      def daily_by_tool
        authorize! @project, to: :show?

        granularity = params[:granularity].presence_in(%w[day month]) || "day"
        days = (params[:days] || 30).to_i.clamp(1, 365)
        time_range_start = days.days.ago.beginning_of_day
        time_range_end = Time.current

        events = @project.tool_events.where(occurred_at: time_range_start..time_range_end)

        # Get top tools by total event count
        top_tools = events
          .group(:tool_name)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(3)
          .pluck(:tool_name)

        trunc = granularity == "month" ? "month" : "day"

        # Get data grouped by bucket and tool
        bucketed_tool_data = events
          .group("DATE_TRUNC('#{trunc}', occurred_at)", :tool_name)
          .select(
            "DATE_TRUNC('#{trunc}', occurred_at) as bucket",
            "tool_name",
            "COUNT(*) as event_count"
          )
          .order("bucket")

        # Transform into chart-friendly format
        date_map = {}
        bucketed_tool_data.each do |row|
          date = row.bucket&.to_date&.iso8601
          next unless date

          date_map[date] ||= { date: date }
          tool_key = top_tools.include?(row.tool_name) ? row.tool_name : "Other"
          date_map[date][tool_key] ||= 0
          date_map[date][tool_key] += row.event_count
        end

        # Zero-fill the full range
        all_buckets = if granularity == "month"
          start_month = time_range_start.beginning_of_month.to_date
          end_month = time_range_end.beginning_of_month.to_date
          months = []
          m = start_month
          while m <= end_month
            months << m.iso8601
            m = m.next_month
          end
          months
        else
          (time_range_start.to_date..time_range_end.to_date).map(&:iso8601)
        end

        filled = all_buckets.map { |d| date_map[d] || { date: d } }

        render json: {
          data: filled,
          tools: top_tools + [ "Other" ],
          granularity: granularity
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
        authorize! @project, to: :sync_issues?

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

      # POST /api/v1/projects/:id/favorite
      def favorite
        authorize! @project, to: :show?
        current_user.user_project_favorites.find_or_create_by!(project: @project)
        render json: { data: { favorited: true } }
      end

      # DELETE /api/v1/projects/:id/favorite
      def unfavorite
        authorize! @project, to: :show?
        current_user.user_project_favorites.where(project: @project).destroy_all
        render json: { data: { favorited: false } }
      end

      # GET /api/v1/projects/:id/retention_policy
      def retention_policy
        authorize! (@project.retention_policy || ProjectRetentionPolicy.new(project: @project)), to: :show?
        policy = @project.retention_policy || @project.create_retention_policy!
        render_resource(policy, ProjectRetentionPolicySerializer)
      end

      # PATCH /api/v1/projects/:id/retention_policy
      def update_retention_policy
        authorize! (@project.retention_policy || ProjectRetentionPolicy.new(project: @project)), to: :update?

        return render_resource(@project.retention_policy || @project.create_retention_policy!, ProjectRetentionPolicySerializer) if retention_policy_params.empty?

        policy = @project.retention_policy || @project.build_retention_policy
        changes_before = policy.attributes.slice(*retention_policy_params.keys)

        policy.updated_by = current_user
        if policy.update(retention_policy_params)
          AuditLogRetentionPolicyLogger.log!(
            project: @project,
            actor: current_user,
            policy: policy,
            param_keys: retention_policy_params.keys,
            changes_before: changes_before,
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

      # Action-scoped eager loading. Most actions don't need any associations preloaded
      # (favorite/unfavorite/destroy/sync_issues only touch the project row itself), so
      # the default is a bare find. Actions that read multiple settings or render the
      # full project payload opt in via PROJECT_INCLUDES_BY_ACTION.
      PROJECT_INCLUDES_BY_ACTION = {
        "show" => [ :retention_policy ],
        "settings" => [ :project_settings ],
        "update_setting" => [ :project_settings ],
        "destroy_setting" => [ :project_settings ],
        "link_jira" => [ :project_settings ],
        "link_linear" => [ :project_settings ],
        "sync_issues" => [ :project_settings ],
        "retention_policy" => [ :retention_policy ],
        "update_retention_policy" => [ :retention_policy ]
      }.freeze

      def set_project
        includes = PROJECT_INCLUDES_BY_ACTION[action_name] || []
        scope = includes.any? ? Project.includes(*includes) : Project
        @project = scope.find(params[:id])
      end

      # Defense-in-depth scoping kwargs for ProjectToolEventAggregates.
      # Org projects → match events by organization_id.
      # Personal projects → match events by user_id (the owner).
      def aggregate_scope_for_project(project)
        if project.organization_id.present?
          { organization_id: project.organization_id }
        else
          { user_id: project.owner_id }
        end
      end

      # List-endpoint variant — derive kwargs for a (possibly mixed) project collection.
      # Each kwarg is added independently and the query builder ORs them together.
      def aggregate_scope_for_projects(projects)
        org_ids = projects.filter_map(&:organization_id).uniq
        has_personal_project = projects.any? { |p| p.organization_id.blank? }

        kwargs = {}
        kwargs[:organization_id] = single_org_scope(org_ids) if org_ids.any?
        kwargs[:user_id] = current_user.id if has_personal_project
        kwargs.compact
      end

      # Prefer the projects' actual org when unambiguous; fall back to the request's
      # current_organization for the rare multi-org list (should not happen for the
      # /organizations/:id/projects route, which is already org-filtered).
      def single_org_scope(org_ids)
        return org_ids.first if org_ids.one?

        # This branch should never be reached — the route scopes projects to a single
        # org before pagination. Raise loudly in dev/test so the invariant is visible;
        # in production, fall back and report to the error tracker rather than 500ing.
        raise ArgumentError, "aggregate_scope_for_projects: expected 1 org, got #{org_ids.size} — route filter missing?" unless Rails.env.production?

        Rails.error.report(
          ArgumentError.new("aggregate_scope_for_projects: multi-org list (#{org_ids.size} orgs)"),
          context: { org_ids: org_ids, user_id: current_user.id },
          handled: true
        )
        current_organization&.id
      end

      def log_project_created!
        tracked = { name: @project.name, slug: @project.slug }
        tracked[:is_personal] = true unless @project.organization_project?

        ProjectAuditLog.log(
          project: @project,
          actor: current_user,
          action: "project.create",
          resource: @project,
          tracked_changes: tracked,
          request: request
        )

        return unless @project.organization_project?

        OrganizationAuditLog.log(
          organization: @project.organization,
          actor: current_user,
          action: "project.create",
          resource: @project,
          tracked_changes: tracked.except(:is_personal),
          request: request
        )
      end

      def log_project_deleted!
        tracked = {
          project_id: @project.id,
          name: @project.name,
          slug: @project.slug
        }

        # ProjectAuditLog rows are dependent: :destroy on the project, so user-initiated
        # deletes are recorded on the organization audit log only (durable after destroy).
        return unless @project.organization_project?

        OrganizationAuditLog.log(
          organization: @project.organization,
          actor: current_user,
          action: "project.delete",
          resource: @project,
          tracked_changes: tracked,
          request: request
        )
      end

      def project_params
        params.permit(:name, :slug, :description, :repository_url, :git_remote_url, :is_active)
      end

      def project_update_params
        params.permit(:name, :slug, :description, :repository_url, :git_remote_url, :is_active)
      end

      def retention_policy_params
        params.permit(:raw_event_ttl, :tool_events_retention, :hourly_aggregate_retention,
                      :daily_aggregate_retention, :retention_reason,
                      :cost_threshold_cents, :token_threshold, :alert_enabled)
      end
    end
  end
end
