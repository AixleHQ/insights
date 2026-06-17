# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Temporal::Client do
  let(:mock_client) { instance_double(Temporalio::Client) }
  let(:mock_handle) { instance_double(Temporalio::Client::WorkflowHandle) }

  before do
    described_class.reset!
    allow(Temporalio::Client).to receive(:connect).and_return(mock_client)
  end

  after do
    described_class.reset!
  end

  describe '.start_workflow' do
    it 'starts a workflow with the given parameters' do
      expect(mock_client).to receive(:start_workflow)
        .with(
          'TestWorkflow',
          { arg: 'value' },
          id: 'workflow-123',
          task_queue: 'db90-tasks'
        )
        .and_return(mock_handle)

      described_class.start_workflow(
        'TestWorkflow',
        workflow_id: 'workflow-123',
        args: { arg: 'value' }
      )
    end

    it 'uses custom task queue when provided' do
      expect(mock_client).to receive(:start_workflow)
        .with(
          'TestWorkflow',
          nil,
          id: 'workflow-123',
          task_queue: 'custom-queue'
        )
        .and_return(mock_handle)

      described_class.start_workflow(
        'TestWorkflow',
        workflow_id: 'workflow-123',
        task_queue: 'custom-queue'
      )
    end

    it 'passes execution_timeout when provided' do
      expect(mock_client).to receive(:start_workflow)
        .with(
          'TestWorkflow',
          nil,
          id: 'workflow-123',
          task_queue: 'db90-tasks',
          execution_timeout: 300
        )
        .and_return(mock_handle)

      described_class.start_workflow(
        'TestWorkflow',
        workflow_id: 'workflow-123',
        execution_timeout: 300
      )
    end
  end

  describe '.get_workflow_handle' do
    it 'returns a workflow handle' do
      expect(mock_client).to receive(:workflow_handle)
        .with('workflow-123', run_id: nil)
        .and_return(mock_handle)

      result = described_class.get_workflow_handle('workflow-123')

      expect(result).to eq(mock_handle)
    end
  end

  describe '.query_workflow' do
    it 'queries the workflow' do
      expect(mock_client).to receive(:workflow_handle)
        .with('workflow-123', run_id: nil)
        .and_return(mock_handle)
      expect(mock_handle).to receive(:query).with('current_state')

      described_class.query_workflow('workflow-123', 'current_state')
    end
  end

  describe '.signal_workflow' do
    it 'sends a signal to the workflow' do
      expect(mock_client).to receive(:workflow_handle)
        .with('workflow-123', run_id: nil)
        .and_return(mock_handle)
      expect(mock_handle).to receive(:signal).with('my_signal', { data: 'value' })

      described_class.signal_workflow('workflow-123', 'my_signal', args: { data: 'value' })
    end
  end

  describe '.cancel_workflow' do
    it 'cancels the workflow' do
      expect(mock_client).to receive(:workflow_handle)
        .with('workflow-123', run_id: nil)
        .and_return(mock_handle)
      expect(mock_handle).to receive(:cancel)

      described_class.cancel_workflow('workflow-123')
    end
  end

  describe '.terminate_workflow' do
    it 'terminates the workflow with reason' do
      expect(mock_client).to receive(:workflow_handle)
        .with('workflow-123', run_id: nil)
        .and_return(mock_handle)
      expect(mock_handle).to receive(:terminate).with('Test termination')

      described_class.terminate_workflow('workflow-123', reason: 'Test termination')
    end
  end

  describe '.connected?' do
    it 'returns true when client is available' do
      expect(described_class.connected?).to eq(true)
    end

    it 'returns false when connection fails' do
      allow(Temporalio::Client).to receive(:connect).and_raise(StandardError)
      described_class.reset!

      expect(described_class.connected?).to eq(false)
    end
  end

  describe '.workers_polling?' do
    let(:mock_connection) { instance_double(Temporalio::Client::Connection) }
    let(:mock_workflow_service) { instance_double(Temporalio::Client::Connection::WorkflowService) }

    before do
      allow(mock_client).to receive(:connection).and_return(mock_connection)
      allow(mock_connection).to receive(:workflow_service).and_return(mock_workflow_service)
      Rails.cache.clear
    end

    it 'returns true when pollers are active' do
      poller = double("poller")
      response = double("response", pollers: [ poller ])
      allow(mock_workflow_service).to receive(:describe_task_queue).and_return(response)

      expect(described_class.workers_polling?).to eq(true)
    end

    it 'returns false when no pollers are active' do
      response = double("response", pollers: [])
      allow(mock_workflow_service).to receive(:describe_task_queue).and_return(response)

      expect(described_class.workers_polling?).to eq(false)
    end

    it 'returns false when Temporal is unreachable' do
      allow(mock_workflow_service).to receive(:describe_task_queue).and_raise(StandardError)

      expect(described_class.workers_polling?).to eq(false)
    end

    it 'caches true result for 5 seconds' do
      poller = double("poller")
      response = double("response", pollers: [ poller ])
      allow(mock_workflow_service).to receive(:describe_task_queue).and_return(response)

      result1 = described_class.workers_polling?
      result2 = described_class.workers_polling?

      expect(result1).to eq(true)
      expect(result2).to eq(true)
    end

    it 'caches false result for only 1 second' do
      response = double("response", pollers: [])
      allow(mock_workflow_service).to receive(:describe_task_queue).and_return(response)

      result = described_class.workers_polling?

      expect(result).to eq(false)
    end
  end
end
