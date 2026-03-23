import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSettingsTab } from './ProjectSettingsTab';

// Radix UI Switch uses ResizeObserver internally via @radix-ui/react-use-size
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const mockUseProject = vi.fn();
const mockUseUpdateProject = vi.fn();
const mockUseProjectAuditLogs = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useUpdateProject: () => mockUseUpdateProject(),
  useProjectAuditLogs: (...args: unknown[]) => mockUseProjectAuditLogs(...args),
}));

const PROJECT_ID = 'test-project-id';

const mockProject = {
  id: PROJECT_ID,
  name: 'My Project',
  description: 'A test project',
  repositoryUrl: 'https://github.com/org/repo',
  isActive: true,
};

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectSettingsTab projectId={PROJECT_ID} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('ProjectSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProject.mockReturnValue({ data: mockProject, isLoading: false });
    mockUseUpdateProject.mockReturnValue({ mutateAsync: vi.fn() });
    mockUseProjectAuditLogs.mockReturnValue({ data: undefined, isLoading: true });
  });

  describe('Sidebar navigation', () => {
    it('renders General and Security & Audit nav items', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /security & audit/i })).toBeInTheDocument();
    });

    it('shows General as the default active page', () => {
      renderComponent();

      const generalBtn = screen.getByRole('button', { name: /general/i });
      expect(generalBtn.className).toMatch(/bg-primary/);

      expect(screen.getByText('Update your project settings')).toBeInTheDocument();
    });

    it('switches to Security & Audit when clicked', async () => {
      renderComponent();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /security & audit/i }));

      expect(screen.getByText('Security & Audit Log')).toBeInTheDocument();
      expect(screen.queryByText('Update your project settings')).not.toBeInTheDocument();
    });

    it('switches back to General when clicked', async () => {
      renderComponent();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /security & audit/i }));
      await user.click(screen.getByRole('button', { name: /general/i }));

      expect(screen.getByText('Update your project settings')).toBeInTheDocument();
    });

    it('highlights the active nav item', async () => {
      renderComponent();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /security & audit/i }));

      const securityBtn = screen.getByRole('button', { name: /security & audit/i });
      const generalBtn = screen.getByRole('button', { name: /general/i });

      expect(securityBtn.className).toMatch(/bg-primary/);
      expect(generalBtn.className).not.toMatch(/bg-primary/);
    });
  });

  describe('General settings page', () => {
    it('shows loading skeleton while project loads', () => {
      mockUseProject.mockReturnValue({ data: undefined, isLoading: true });
      renderComponent();

      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.queryByLabelText(/project name/i)).not.toBeInTheDocument();
    });

    it('renders project form with project data', () => {
      renderComponent();

      expect(screen.getByDisplayValue('My Project')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A test project')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://github.com/org/repo')).toBeInTheDocument();
    });

    it('shows Saved indicator after successful submit', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      mockUseUpdateProject.mockReturnValue({ mutateAsync });
      renderComponent();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument();
      });
    });
  });
});
