import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectRepoSheet } from './ConnectRepoSheet';

vi.mock('@/contexts/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();
const mockConnectors = [
  { id: 'connector-1', connectorType: 'github', externalAccountName: 'my-github', isActive: true, status: 'connected' },
];
const mockAvailableRepos = [
  { externalId: 'r1', name: 'repo-a', fullName: 'org/repo-a', htmlUrl: 'https://github.com/org/repo-a', defaultBranch: 'main', isPrivate: false, alreadyLinked: false },
  { externalId: 'r2', name: 'repo-b', fullName: 'org/repo-b', htmlUrl: 'https://github.com/org/repo-b', defaultBranch: 'main', isPrivate: true, alreadyLinked: true },
];

vi.mock('@/hooks/useApi', () => ({
  useConnectors: () => ({ data: mockConnectors }),
  useAvailableRepos: (_orgId: string, connectorId: string, enabled: boolean) => ({
    data: enabled && connectorId ? mockAvailableRepos : [],
    isLoading: false,
  }),
  useConnectRepo: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

const defaultProps = {
  projectId: 'project-1',
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

function renderSheet(props = {}) {
  return render(<ConnectRepoSheet {...defaultProps} {...props} />);
}

describe('ConnectRepoSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
  });

  it('renders the sheet title', () => {
    renderSheet();
    expect(screen.getByText('Connect Repository')).toBeInTheDocument();
  });

  it('renders the connector dropdown with available accounts', () => {
    renderSheet();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows the repo list after selecting a connector', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('my-github'));

    await waitFor(() => {
      expect(screen.getByText('org/repo-a')).toBeInTheDocument();
      expect(screen.getByText('org/repo-b')).toBeInTheDocument();
    });
  });

  it('marks already-linked repos as disabled', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('my-github'));

    await waitFor(() => {
      expect(screen.getByText('Linked')).toBeInTheDocument();
    });

    // The already-linked button should be disabled
    const buttons = screen.getAllByRole('button');
    const repoButtons = buttons.filter((b) => b.textContent?.includes('org/repo-b'));
    expect(repoButtons[0]).toBeDisabled();
  });

  it('calls useConnectRepo mutation when clicking an unlinked repo', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('my-github'));

    await waitFor(() => {
      expect(screen.getByText('org/repo-a')).toBeInTheDocument();
    });

    // Click the unlinked repo button
    const buttons = screen.getAllByRole('button');
    const repoAButton = buttons.find((b) => b.textContent?.includes('org/repo-a'));
    await user.click(repoAButton!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_connector_id: 'connector-1',
          external_id: 'r1',
          name: 'repo-a',
          full_name: 'org/repo-a',
        })
      );
    });
  });
});
