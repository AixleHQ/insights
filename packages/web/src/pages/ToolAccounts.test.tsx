import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToolAccounts } from './ToolAccounts';
import type { ToolAccount } from '@/lib/types';

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'org-1', name: 'Acme', slug: 'acme' },
    isLoading: false,
  }),
}));

const mockCreateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockUseToolAccounts = vi.fn();
const mockUseUpdateToolAccount = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useToolAccounts: (...args: unknown[]) => mockUseToolAccounts(...args),
  useCreateToolAccount: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useDeleteToolAccount: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
  useUpdateToolAccount: (...args: unknown[]) => mockUseUpdateToolAccount(...args),
  useUserOrganizations: () => ({
    data: [{ id: 'org-1', name: 'Acme', slug: 'acme' }],
    isLoading: false,
  }),
}));

const mockAccount = (overrides: Partial<ToolAccount> = {}): ToolAccount => ({
  id: 'acct-1',
  toolName: 'claude_code',
  isActive: true,
  externalUserId: 'user-123',
  externalUsername: 'anaure',
  externalEmail: null,
  organizationMembershipId: 'mem-1',
  tokenExpired: false,
  tokenExpiresAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function renderToolAccounts(embedded = false) {
  return render(
    <MemoryRouter>
      <ToolAccounts embedded={embedded} />
    </MemoryRouter>
  );
}

describe('ToolAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutateAsync.mockResolvedValue({});
    mockDeleteMutateAsync.mockResolvedValue({});
    mockUpdateMutateAsync.mockResolvedValue({});
    mockUseUpdateToolAccount.mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false });
    mockUseToolAccounts.mockReturnValue({ data: [], isLoading: false });
  });

  describe('page layout', () => {
    it('shows Available section heading', () => {
      renderToolAccounts();
      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('shows back button and title when not embedded', () => {
      renderToolAccounts(false);
      expect(screen.getByRole('link', { name: /back to settings/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Tool Accounts' })).toBeInTheDocument();
    });

    it('hides back button and title when embedded', () => {
      renderToolAccounts(true);
      expect(screen.queryByRole('link', { name: /back to settings/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Tool Accounts' })).not.toBeInTheDocument();
    });

    it('shows organization selector', () => {
      renderToolAccounts();
      expect(screen.getByLabelText('Organization')).toBeInTheDocument();
    });

    it('shows loading skeletons while fetching', () => {
      mockUseToolAccounts.mockReturnValue({ data: undefined, isLoading: true });
      const { container } = renderToolAccounts();
      // skeletons render as animated divs — check Connected/Available headings are absent
      expect(screen.queryByText('Available')).not.toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });

    it('passes orgId from context to useToolAccounts', () => {
      renderToolAccounts();
      expect(mockUseToolAccounts).toHaveBeenCalledWith('org-1');
    });
  });

  describe('with no connected accounts', () => {
    it('shows Connect button for each provider', () => {
      renderToolAccounts();
      const connectButtons = screen.getAllByRole('button', { name: /connect/i });
      expect(connectButtons.length).toBeGreaterThan(0);
    });

    it('does not show Connected section heading', () => {
      renderToolAccounts();
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });
  });

  describe('with connected accounts', () => {
    it('shows Connected section heading', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole('heading', { name: 'Connected' })).toBeInTheDocument();
    });

    it('shows Connected badge when isActive', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ isActive: true })], isLoading: false });
      renderToolAccounts();
      // Both the section heading and the badge render "Connected"
      expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(2);
    });

    it('shows Inactive badge when isActive is false', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ isActive: false })], isLoading: false });
      renderToolAccounts();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('shows linked username below provider name', () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ externalUsername: 'anaure' })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText('Linked as anaure')).toBeInTheDocument();
    });

    it('falls back to externalUserId when externalUsername is null', () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ externalUsername: null, externalUserId: 'user-123' })],
        isLoading: false,
      });
      renderToolAccounts();
      expect(screen.getByText('Linked as user-123')).toBeInTheDocument();
    });

    it('shows "all tools connected" message when no providers are available', () => {
      // Mock all 8 toolProviders as connected by providing accounts for each
      const allToolNames = [
        'claude_code', 'github_copilot', 'cursor', 'windsurf',
        'openai_api', 'anthropic_api', 'gemini_api', 'aider',
      ];
      const accounts = allToolNames.map((toolName, i) =>
        mockAccount({ id: `acct-${i}`, toolName })
      );
      mockUseToolAccounts.mockReturnValue({ data: accounts, isLoading: false });
      renderToolAccounts();
      expect(screen.getByText('All available tools are connected.')).toBeInTheDocument();
    });
  });

  describe('connect flow', () => {
    it('opens dialog with provider name when Connect is clicked', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Dialog title contains provider name
      expect(screen.getByRole('heading', { name: /connect/i })).toBeInTheDocument();
    });

    it('dialog renders all three form fields', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);

      expect(screen.getByLabelText('Account ID or Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Display Name (optional)')).toBeInTheDocument();
      expect(screen.getByLabelText('Access Token (optional)')).toBeInTheDocument();
    });

    it('token field is a password input', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);

      expect(screen.getByLabelText('Access Token (optional)')).toHaveAttribute('type', 'password');
    });

    it('submit button is disabled when Account ID is empty', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);

      expect(screen.getByRole('button', { name: 'Connect Account' })).toBeDisabled();
    });

    it('submit button is enabled once Account ID is filled', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');

      expect(screen.getByRole('button', { name: 'Connect Account' })).toBeEnabled();
    });

    it('calls createAccount with accountId, accountName, and accessToken', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.type(screen.getByLabelText('Display Name (optional)'), 'My Name');
      await user.type(screen.getByLabelText('Access Token (optional)'), 'sk-secret-token');
      await user.click(screen.getByRole('button', { name: 'Connect Account' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            orgId: 'org-1',
            externalUserId: 'my-username',
            externalUsername: 'My Name',
            accessToken: 'sk-secret-token',
          })
        );
      });
    });

    it('omits accessToken from payload when token field is left empty', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.click(screen.getByRole('button', { name: 'Connect Account' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ accessToken: undefined })
        );
      });
    });

    it('closes dialog after successful submission', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.click(screen.getByRole('button', { name: 'Connect Account' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('shows error message when submission fails', async () => {
      mockCreateMutateAsync.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.click(screen.getByRole('button', { name: 'Connect Account' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to connect account. Please try again.')).toBeInTheDocument();
      });
    });

    it('does not close dialog when submission fails', async () => {
      mockCreateMutateAsync.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.click(screen.getByRole('button', { name: 'Connect Account' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to connect account. Please try again.')).toBeInTheDocument();
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('resets form fields when dialog is closed via Cancel', async () => {
      const user = userEvent.setup();
      renderToolAccounts();

      // Open, fill in token, cancel
      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      await user.type(screen.getByLabelText('Account ID or Username'), 'my-username');
      await user.type(screen.getByLabelText('Access Token (optional)'), 'sk-secret');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Reopen — fields should be empty
      await user.click(screen.getAllByRole('button', { name: /connect/i })[0]);
      expect(screen.getByLabelText('Account ID or Username')).toHaveValue('');
      expect(screen.getByLabelText('Access Token (optional)')).toHaveValue('');
    });
  });

  describe('disconnect flow', () => {
    it('shows trash button for connected accounts', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      renderToolAccounts();
      // The trash button is the only icon button in the connected row
      expect(screen.getByRole('button', { name: '' })).toBeInTheDocument();
    });

    it('opens confirmation dialog when trash button is clicked', async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      // Click the trash icon button
      const trashButton = screen.getByRole('button', { name: '' });
      await user.click(trashButton);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/disconnect claude code\?/i)).toBeInTheDocument();
    });

    it('calls deleteAccount with correct id when Disconnect is confirmed', async () => {
      mockUseToolAccounts.mockReturnValue({
        data: [mockAccount({ id: 'acct-abc' })],
        isLoading: false,
      });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole('button', { name: '' }));
      await user.click(screen.getByRole('button', { name: 'Disconnect' }));

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith({
          orgId: 'org-1',
          accountId: 'acct-abc',
        });
      });
    });

    it('does not call deleteAccount when Cancel is clicked in confirmation', async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount()], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole('button', { name: '' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('enable/disable flow', () => {
    it('shows Disable button for an active connected account', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ isActive: true })], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    });

    it('shows Enable button for an inactive connected account', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ isActive: false })], isLoading: false });
      renderToolAccounts();
      expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    });

    it('calls updateAccount with isActive: false when Disable is clicked', async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ id: 'acct-1', isActive: true })], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole('button', { name: 'Disable' }));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          orgId: 'org-1',
          accountId: 'acct-1',
          isActive: false,
        });
      });
    });

    it('calls updateAccount with isActive: true when Enable is clicked', async () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ id: 'acct-1', isActive: false })], isLoading: false });
      const user = userEvent.setup();
      renderToolAccounts();

      await user.click(screen.getByRole('button', { name: 'Enable' }));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
          orgId: 'org-1',
          accountId: 'acct-1',
          isActive: true,
        });
      });
    });

    it('applies opacity-60 to an inactive account row', () => {
      mockUseToolAccounts.mockReturnValue({ data: [mockAccount({ isActive: false })], isLoading: false });
      const { container } = renderToolAccounts();
      expect(container.querySelector('.opacity-60')).toBeInTheDocument();
    });

    it('disables only the toggled account button while the mutation is pending', () => {
      mockUseUpdateToolAccount.mockReturnValue({
        mutateAsync: mockUpdateMutateAsync,
        isPending: true,
        variables: { accountId: 'acct-1', orgId: 'org-1', isActive: false },
      });
      mockUseToolAccounts.mockReturnValue({
        data: [
          mockAccount({ id: 'acct-1', toolName: 'claude_code', isActive: true }),
          mockAccount({ id: 'acct-2', toolName: 'cursor', isActive: true }),
        ],
        isLoading: false,
      });
      renderToolAccounts();
      const buttons = screen.getAllByRole('button', { name: 'Disable' });
      expect(buttons[0]).toBeDisabled();
      expect(buttons[1]).not.toBeDisabled();
    });

    it('does not show Disable or Enable buttons for unconnected providers', () => {
      mockUseToolAccounts.mockReturnValue({ data: [], isLoading: false });
      renderToolAccounts();
      expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
    });
  });
});
