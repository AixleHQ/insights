# frozen_string_literal: true

require 'rails_helper'

RSpec.describe LinearSyncJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector) { create(:organization_connector, :linear, organization: organization, access_token: 'lin-token') }
  let(:member) { create(:user, email: 'alice@example.com') }
  let(:provider) { instance_double(Oauth::LinearProvider) }

  before do
    create(:organization_membership, organization: organization, user: member, role: 'member')
    allow(Oauth::BaseProvider).to receive(:for).with(connector).and_return(provider)
    allow(provider).to receive(:refresh_token!).and_return(true)
    allow(provider).to receive(:fetch_teams).and_return([
      { external_id: 'team-1', name: 'Engineering', key: 'ENG' }
    ])
    allow(provider).to receive(:fetch_projects).and_return([
      { external_id: 'project-1', name: 'Platform', state: 'started', teams: [ { 'id' => 'team-1', 'name' => 'Engineering' } ] }
    ])
    allow(provider).to receive(:fetch_cycles).with(team_id: 'team-1').and_return([
      {
        external_id: 'cycle-1',
        number: 42,
        name: 'Sprint 42',
        starts_at: '2026-04-01T00:00:00Z',
        ends_at: '2026-04-14T00:00:00Z',
        team_id: 'team-1',
        team_name: 'Engineering',
        team_key: 'ENG'
      }
    ])
    allow(provider).to receive(:fetch_issues).and_return([
      {
        external_id: 'issue-1',
        identifier: 'ENG-101',
        title: 'Ship throughput card',
        priority: 1,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
        completed_at: nil,
        canceled_at: nil,
        state_id: 'state-1',
        state_name: 'In Progress',
        state_type: 'started',
        team_id: 'team-1',
        team_name: 'Engineering',
        team_key: 'ENG',
        project_id: 'project-1',
        project_name: 'Platform',
        cycle_id: 'cycle-1',
        cycle_name: 'Sprint 42',
        cycle_number: 42,
        assignee_id: 'lin-user-1',
        assignee_name: 'Alice',
        assignee_email: 'alice@example.com',
        creator_id: 'lin-user-2',
        creator_name: 'Bob',
        creator_email: 'bob@example.com'
      }
    ])
  end

  it 'syncs teams, projects, cycles, and issue snapshots' do
    described_class.perform_now(connector.id, 'sync')

    connector.reload
    expect(connector.config['teams'].keys).to include('team-1')
    expect(connector.config['projects'].keys).to include('project-1')
    expect(connector.config['cycles'].keys).to include('cycle-1')

    event = organization.tool_events.find_by(tool_name: 'linear', event_type: 'issue')
    expect(event).to be_present
    expect(event.user_id).to eq(member.id)
    expect(event.metadata['issue_identifier']).to eq('ENG-101')
    expect(event.metadata['action']).to eq('synced')
  end

  it 'deduplicates repeated syncs' do
    described_class.perform_now(connector.id, 'sync')
    described_class.perform_now(connector.id, 'sync')

    expect(
      organization.tool_events.where(tool_name: 'linear', event_type: 'issue').count
    ).to eq(1)
  end

  it 'records state change webhook events' do
    payload = {
      'type' => 'Issue',
      'action' => 'update',
      'createdAt' => '2026-04-03T12:00:00Z',
      'updatedFrom' => {
        'stateId' => 'state-0',
        'stateName' => 'Todo',
        'stateType' => 'unstarted'
      },
      'data' => {
        'id' => 'issue-1',
        'identifier' => 'ENG-101',
        'title' => 'Ship throughput card',
        'priority' => 1,
        'updatedAt' => '2026-04-03T12:00:00Z',
        'state' => { 'id' => 'state-1', 'name' => 'In Progress', 'type' => 'started' },
        'team' => { 'id' => 'team-1', 'name' => 'Engineering', 'key' => 'ENG' },
        'assignee' => { 'id' => 'lin-user-1', 'name' => 'Alice', 'email' => 'alice@example.com' }
      }
    }

    described_class.perform_now(connector.id, 'webhook', payload: payload)

    event = organization.tool_events.where(tool_name: 'linear', event_type: 'issue')
                  .find_by("metadata ->> 'action' = ?", 'state_changed')

    expect(event).to be_present
    expect(event.user_id).to eq(member.id)
    expect(event.metadata['from_state_type']).to eq('unstarted')
    expect(event.metadata['to_state_type']).to eq('started')
  end
end
