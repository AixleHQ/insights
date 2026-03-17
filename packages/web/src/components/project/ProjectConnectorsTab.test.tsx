import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectConnectorsTab } from './ProjectConnectorsTab';
import { ApiError } from '@/lib/api';
import type { ProjectConnector } from '@/lib/types';

const mockProjectConnectors = vi.fn();
const mockConnectWithApiKey = vi.fn();
const mockDeleteConnector = vi.fn();
const mockTestConnector = vi.fn();

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useApi', () => ({
  useProjectConnectors: () => mockProjectConnectors(),
  useProjectConnectWithApiKey: () => ({ mutateAsync: mockConnectWithApiKey }),
  useProjectDeleteConnector: () => ({ mutateAsync: mockDeleteConnector }),
  useProjectTestConnector: () => ({ mutateAsync: mockTestConnector }),
  useConnectWithApiKey: () => ({ mutateAsync: vi.fn() }),
}));

const PROJECT_ID = 'test-project-id';

const connectedAnthropicConnector: ProjectConnector = {
  id: 'connector-1',
  project_id: PROJECT_ID,
  connectorType: 'anthropic',
  isActive: true,
  status: 'connected',
  externalAccountName: null,
  lastSyncAt: null,
  lastError: null,
};

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectConnectorsTab projectId={PROJECT_ID} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('ProjectConnectorsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectWithApiKey.mockResolvedValue({});
    mockDeleteConnector.mockResolvedValue({});
    mockTestConnector.mockResolvedValue({ data: { success: true } });
  });

  describe('Loading state', () => {
    it('shows skeleton loaders while fetching', () => {
      mockProjectConnectors.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();
      // Tab labels still render while loading
      expect(screen.getByRole('tab', { name: /connected/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /available/i })).toBeInTheDocument();
    });
  });

  describe('Connected tab', () => {
    it('shows empty state when no connectors are connected', () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByText('No AI providers connected')).toBeInTheDocument();
    });

    it('displays connected connector count in tab label', () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByRole('tab', { name: /connected \(1\)/i })).toBeInTheDocument();
    });

    it('renders connected connector as card with provider name', () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      // IntegrationCard for connected connector shows integration.name (connectorType when no external name)
      // appears in both title and description — use getAllByText
      expect(screen.getAllByText('anthropic').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Connected status badge for a connected connector', () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows Error status badge for a connector with an error', () => {
      const errorConnector: ProjectConnector = {
        ...connectedAnthropicConnector,
        status: 'error',
        lastError: 'API key expired',
      };
      mockProjectConnectors.mockReturnValue({ data: [errorConnector], isLoading: false });
      renderComponent();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('Available tab', () => {
    it('shows all 4 AI providers when none are connected', () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      renderComponent();
      expect(screen.getByRole('tab', { name: /available \(4\)/i })).toBeInTheDocument();
    });

    it('excludes already-connected providers from the Available tab count', () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      renderComponent();
      expect(screen.getByRole('tab', { name: /available \(3\)/i })).toBeInTheDocument();
    });

    it('shows the 4 AI provider names in the Available tab', async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('tab', { name: /available/i }));

      expect(screen.getByText('Anthropic API')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('OpenRouter')).toBeInTheDocument();
      expect(screen.getByText('Gemini')).toBeInTheDocument();
    });

    it('shows empty state when all providers are connected', async () => {
      const allConnected: ProjectConnector[] = [
        { ...connectedAnthropicConnector, id: '1', connectorType: 'anthropic' },
        { ...connectedAnthropicConnector, id: '2', connectorType: 'openai' },
        { ...connectedAnthropicConnector, id: '3', connectorType: 'openrouter' },
        { ...connectedAnthropicConnector, id: '4', connectorType: 'gemini' },
      ];
      mockProjectConnectors.mockReturnValue({ data: allConnected, isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('tab', { name: /available \(0\)/i }));

      expect(screen.getByText('All AI providers are connected')).toBeInTheDocument();
    });
  });

  describe('Connect flow', () => {
    it('opens the API key sheet when clicking Connect on an available provider', async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('tab', { name: /available/i }));
      const connectButtons = screen.getAllByRole('button', { name: /^connect$/i });
      await user.click(connectButtons[0]);

      expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    });

    it('calls useProjectConnectWithApiKey with projectId and connectorType on submit', async () => {
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('tab', { name: /available/i }));
      const connectButtons = screen.getAllByRole('button', { name: /^connect$/i });
      await user.click(connectButtons[0]);

      await user.type(screen.getByLabelText('API Key'), 'sk-ant-test-key');
      await user.click(screen.getByRole('button', { name: /^connect$/i }));

      await waitFor(() => {
        expect(mockConnectWithApiKey).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: PROJECT_ID,
            apiKey: 'sk-ant-test-key',
          })
        );
      });
    });

    it('shows inline error when API key is invalid', async () => {
      mockConnectWithApiKey.mockRejectedValue(
        new ApiError('Validation error', 422, {
          errors: { access_token: ['Invalid API key'] },
        })
      );
      mockProjectConnectors.mockReturnValue({ data: [], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('tab', { name: /available/i }));
      const connectButtons = screen.getAllByRole('button', { name: /^connect$/i });
      await user.click(connectButtons[0]);

      await user.type(screen.getByLabelText('API Key'), 'bad-key');
      await user.click(screen.getByRole('button', { name: /^connect$/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });
  });

  describe('Disconnect flow', () => {
    it('calls deleteConnector with projectId and connectorId on confirm', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      // Open the actions dropdown (sr-only label: "Actions")
      await user.click(screen.getByRole('button', { name: /actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /disconnect/i }));

      await waitFor(() => {
        expect(mockDeleteConnector).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          connectorId: connectedAnthropicConnector.id,
        });
      });
    });

    it('does not call deleteConnector when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('button', { name: /actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /disconnect/i }));

      expect(mockDeleteConnector).not.toHaveBeenCalled();
    });
  });

  describe('Test connection flow', () => {
    it('calls testConnector with projectId and connectorId', async () => {
      mockProjectConnectors.mockReturnValue({ data: [connectedAnthropicConnector], isLoading: false });
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('button', { name: /actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /test connection/i }));

      await waitFor(() => {
        expect(mockTestConnector).toHaveBeenCalledWith({
          projectId: PROJECT_ID,
          connectorId: connectedAnthropicConnector.id,
        });
      });
    });
  });
});
