import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { AlertSettings } from './Settings';

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();

// Minimal default: no connectors, no saved settings
let mockSettingsData: { data: Array<{ key: string; value: string }> } | undefined = undefined;
let mockConnectorsData: Array<{ connectorType: string; isActive: boolean }> = [];

vi.mock('@/hooks/useApi', () => ({
  useOrganizationSettings: () => ({
    data: mockSettingsData,
    isLoading: false,
  }),
  useUpdateOrganizationSetting: () => ({
    mutate: mockMutate,
    mutateAsync: mockMutateAsync,
  }),
  useConnectors: () => ({
    data: mockConnectorsData,
  }),
}));

function renderAlertSettings() {
  return render(<AlertSettings />);
}

describe('AlertSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    mockSettingsData = undefined;
    mockConnectorsData = [];
  });

  describe('Cost Thresholds', () => {
    it('renders daily and monthly cost inputs', () => {
      renderAlertSettings();
      expect(screen.getByLabelText('Daily Cost Limit (USD)')).toBeInTheDocument();
      expect(screen.getByLabelText('Monthly Cost Limit (USD)')).toBeInTheDocument();
    });

    it('uses default value of 500 for daily when no setting exists', () => {
      renderAlertSettings();
      expect(screen.getByLabelText('Daily Cost Limit (USD)')).toHaveValue(500);
    });

    it('uses default value of 5000 for monthly when no setting exists', () => {
      renderAlertSettings();
      expect(screen.getByLabelText('Monthly Cost Limit (USD)')).toHaveValue(5000);
    });

    it('displays saved daily cost from settings', () => {
      mockSettingsData = { data: [{ key: 'alert_cost_daily', value: '250' }] };
      renderAlertSettings();
      expect(screen.getByLabelText('Daily Cost Limit (USD)')).toHaveValue(250);
    });

    it('displays saved monthly cost from settings', () => {
      mockSettingsData = { data: [{ key: 'alert_cost_monthly', value: '3000' }] };
      renderAlertSettings();
      expect(screen.getByLabelText('Monthly Cost Limit (USD)')).toHaveValue(3000);
    });

    it('saves daily cost on blur when valid', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Daily Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '300');
      await user.tab();

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ key: 'alert_cost_daily', value: '300' })
        );
      });
    });

    it('saves monthly cost on blur when valid', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Monthly Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '8000');
      await user.tab();

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ key: 'alert_cost_monthly', value: '8000' })
        );
      });
    });
  });

  describe('Cost threshold validation', () => {
    it('shows error message for negative daily input', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Daily Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '-5');

      expect(screen.getByText('Must be a non-negative number')).toBeInTheDocument();
    });

    it('shows error message for negative monthly input', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Monthly Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '-5');

      expect(screen.getByText('Must be a non-negative number')).toBeInTheDocument();
    });

    it('does not save daily cost on blur when input is invalid', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Daily Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, 'abc');
      await user.tab();

      expect(mockMutate).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: 'alert_cost_daily' })
      );
    });

    it('does not save monthly cost on blur when input is invalid', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Monthly Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '-50');
      await user.tab();

      expect(mockMutate).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: 'alert_cost_monthly' })
      );
    });

    it('clears the error when a valid value is entered after an invalid one', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Daily Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, '-5');
      expect(screen.getByText('Must be a non-negative number')).toBeInTheDocument();

      await user.clear(input);
      await user.type(input, '100');
      expect(screen.queryByText('Must be a non-negative number')).not.toBeInTheDocument();
    });

    it('applies destructive border style to daily input when invalid', async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      const input = screen.getByLabelText('Daily Cost Limit (USD)');
      await user.clear(input);
      await user.type(input, 'bad');

      expect(input).toHaveClass('border-destructive');
    });
  });

  describe('Slack Notifications toggle', () => {
    it('disables Slack toggle when no Slack connector exists', () => {
      mockConnectorsData = [];
      renderAlertSettings();

      const slackSwitch = screen.getByRole('switch', { name: /slack notifications/i });
      expect(slackSwitch).toBeDisabled();
    });

    it('shows hint to connect Slack when no connector exists', () => {
      mockConnectorsData = [];
      renderAlertSettings();

      expect(
        screen.getByText('Connect a Slack integration to enable this')
      ).toBeInTheDocument();
    });

    it('enables Slack toggle when an active Slack connector exists', () => {
      mockConnectorsData = [{ connectorType: 'slack', isActive: true }];
      renderAlertSettings();

      const slackSwitch = screen.getByRole('switch', { name: /slack notifications/i });
      expect(slackSwitch).toBeEnabled();
    });

    it('shows normal hint text when Slack connector is connected', () => {
      mockConnectorsData = [{ connectorType: 'slack', isActive: true }];
      renderAlertSettings();

      expect(screen.getByText('Post alerts to a Slack channel')).toBeInTheDocument();
    });

    it('disables Slack toggle when connector exists but is inactive', () => {
      mockConnectorsData = [{ connectorType: 'slack', isActive: false }];
      renderAlertSettings();

      const slackSwitch = screen.getByRole('switch', { name: /slack notifications/i });
      expect(slackSwitch).toBeDisabled();
    });

    it('does not fire update when disabled Slack toggle is clicked', async () => {
      mockConnectorsData = [];
      const user = userEvent.setup();
      renderAlertSettings();

      const slackSwitch = screen.getByRole('switch', { name: /slack notifications/i });
      await user.click(slackSwitch);

      expect(mockMutate).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: 'alert_slack' })
      );
    });
  });

  describe('Risk Alerts toggles', () => {
    it('renders all three risk alert toggles', () => {
      renderAlertSettings();

      expect(screen.getByRole('switch', { name: /critical risk events/i })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: /high risk events/i })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: /usage spikes/i })).toBeInTheDocument();
    });

    it('saves critical risk setting when toggled', async () => {
      mockSettingsData = { data: [{ key: 'alert_risk_critical', value: 'true' }] };
      const user = userEvent.setup();
      renderAlertSettings();

      await user.click(screen.getByRole('switch', { name: /critical risk events/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ key: 'alert_risk_critical' })
        );
      });
    });
  });

  describe('Notification Channels', () => {
    it('renders email notifications toggle', () => {
      renderAlertSettings();
      expect(screen.getByRole('switch', { name: /email notifications/i })).toBeInTheDocument();
    });

    it('saves email setting when toggled', async () => {
      mockSettingsData = { data: [{ key: 'alert_email', value: 'true' }] };
      const user = userEvent.setup();
      renderAlertSettings();

      await user.click(screen.getByRole('switch', { name: /email notifications/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ key: 'alert_email' })
        );
      });
    });
  });
});
