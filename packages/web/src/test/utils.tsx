import type { ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

// Test wrapper with all providers
function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  };
}

// Custom render with providers
function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: createWrapper(), ...options });
}

// eslint-disable-next-line react-refresh/only-export-components
export * from "@testing-library/react";
export { customRender as render };

// Mock auth context values
export const mockAuthContext = {
  isAuthenticated: true,
  isLoading: false,
  user: null,
  profile: {
    sub: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    picture: undefined,
  },
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
};

// Mock org context values
export const mockOrgContext = {
  currentOrg: {
    id: "test-org-id",
    name: "Test Organization",
    slug: "test-org",
  },
  memberships: [],
  setCurrentOrg: vi.fn(),
  refreshOrganizations: vi.fn(),
  isLoading: false,
  currentRole: "admin" as const,
};
