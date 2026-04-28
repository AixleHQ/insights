# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::InternalController', type: :request do
  let(:organization) { create(:organization) }
  let(:project) { create(:project, organization: organization) }

  before do
    allow(EventsChannel).to receive(:broadcast_alert)
    allow(Slack::NotificationService).to receive(:deliver_alert)
    allow(Slack::ProjectNotificationService).to receive(:deliver_alert)
  end

  describe 'POST /api/internal/alerts' do
    let(:alert_payload) do
      {
        alert: {
          organization_id: organization.id,
          alert_type: 'risk_critical',
          severity: 'critical',
          title: 'High risk activity detected'
        }
      }
    end

    context 'project-level Slack delivery' do
      context 'when a project has alert_slack enabled and an active Slack connector' do
        before do
          create(:project_setting, project: project, key: 'alert_slack', value: 'true')
          create(:project_connector, :slack, project: project)
        end

        it 'delivers the risk alert to the project Slack webhook' do
          expect(Slack::ProjectNotificationService).to receive(:deliver_alert)
            .with(project, hash_including(alert_type: 'risk_critical'))

          post '/api/internal/alerts', params: alert_payload
        end
      end

      context 'when project_id is specified in the alert' do
        before do
          create(:project_setting, project: project, key: 'alert_slack', value: 'true')
          create(:project_connector, :slack, project: project)
        end

        it 'delivers only to the specified project' do
          other_project = create(:project, organization: organization)
          create(:project_setting, project: other_project, key: 'alert_slack', value: 'true')
          create(:project_connector, :slack, project: other_project)

          expect(Slack::ProjectNotificationService).to receive(:deliver_alert)
            .with(project, anything)
            .once

          post '/api/internal/alerts', params: alert_payload.deep_merge(alert: { project_id: project.id })
        end
      end

      context 'when a project has alert_slack disabled' do
        before do
          create(:project_setting, project: project, key: 'alert_slack', value: 'false')
          create(:project_connector, :slack, project: project)
        end

        it 'does not deliver to the project' do
          expect(Slack::ProjectNotificationService).not_to receive(:deliver_alert)

          post '/api/internal/alerts', params: alert_payload
        end
      end

      context 'when no project has alert_slack enabled' do
        it 'does not deliver to any project Slack webhook' do
          expect(Slack::ProjectNotificationService).not_to receive(:deliver_alert)

          post '/api/internal/alerts', params: alert_payload
        end
      end
    end

    context 'org-level Slack delivery' do
      context 'when org has alert_slack enabled' do
        before do
          create(:organization_setting, organization: organization, key: 'alert_slack', value: 'true')
        end

        it 'delivers to org Slack' do
          expect(Slack::NotificationService).to receive(:deliver_alert)
            .with(organization, hash_including(alert_type: 'risk_critical'))

          post '/api/internal/alerts', params: alert_payload
        end
      end

      context 'when org has alert_slack disabled' do
        it 'does not deliver to org Slack' do
          expect(Slack::NotificationService).not_to receive(:deliver_alert)

          post '/api/internal/alerts', params: alert_payload
        end
      end
    end

    it 'broadcasts the alert via ActionCable' do
      expect(EventsChannel).to receive(:broadcast_alert)
        .with(organization.id, hash_including(alert_type: 'risk_critical'))

      post '/api/internal/alerts', params: alert_payload
    end

    it 'returns a created response' do
      post '/api/internal/alerts', params: alert_payload

      expect(response).to have_http_status(:created)
      expect(json_response.dig(:data, :status)).to eq('sent')
    end
  end
end
