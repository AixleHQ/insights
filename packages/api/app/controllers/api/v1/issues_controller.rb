# frozen_string_literal: true

module Api
  module V1
    class IssuesController < BaseController
      before_action :set_project
      before_action :set_issue, only: [ :show ]

      # GET /api/v1/projects/:project_id/issues
      def index
        authorize! @project, to: :show?
        issues = authorized_scope(@project.issues).order(external_updated_at: :desc)
        issues = issues.where(status_category: params[:status_category]) if params[:status_category].present?
        issues = issues.where(issue_type: params[:type]) if params[:type].present?
        issues = issues.where(assignee_id: params[:assignee]) if params[:assignee].present?
        render_collection(issues, IssueSerializer)
      end

      # GET /api/v1/projects/:project_id/issues/:id
      def show
        authorize! @issue
        render_resource(@issue, IssueSerializer)
      end

      private

      def set_project
        @project = authorized_scope(Project.all).find(params[:project_id])
      end

      def set_issue
        @issue = @project.issues.find(params[:id])
      end
    end
  end
end
