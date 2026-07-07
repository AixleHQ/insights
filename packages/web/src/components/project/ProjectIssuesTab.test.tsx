import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectIssuesTab } from "./ProjectIssuesTab";
import type { Issue, ProjectWithStats } from "@/lib/types";

const mockUseProjectIssues = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectIssues: (...args: unknown[]) => mockUseProjectIssues(...args),
  useProject: () => ({ data: undefined }),
  useSyncProjectIssues: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("./ConnectJiraSheet", () => ({ ConnectJiraSheet: () => null }));
vi.mock("./ConnectLinearSheet", () => ({ ConnectLinearSheet: () => null }));

const PROJECT_ID = "test-project-id";

const project = {
  id: PROJECT_ID,
  jiraProjectKey: "ENG",
  issuesSyncedAt: "2026-03-20T10:00:00Z",
} as ProjectWithStats;

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: crypto.randomUUID(),
    key: "ENG-1",
    summary: "An issue",
    jiraProjectKey: "ENG",
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-20T10:00:00Z",
    ...overrides,
  };
}

const singlePageMeta = { current_page: 1, total_pages: 1, total_count: 3, per_page: 25 };
const multiPageMeta = { current_page: 1, total_pages: 4, total_count: 87, per_page: 25 };

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProjectIssuesTab projectId={PROJECT_ID} project={project} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("ProjectIssuesTab pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the first page on initial render", () => {
    mockUseProjectIssues.mockReturnValue({ data: undefined, isLoading: true });
    renderComponent();

    expect(mockUseProjectIssues).toHaveBeenCalledWith(PROJECT_ID, {
      status_category: undefined,
      type: undefined,
      page: 1,
    });
  });

  it("does not show pagination controls for a single page of results", () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue()], meta: singlePageMeta },
      isLoading: false,
    });
    renderComponent();

    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  it("shows pagination info and controls when there is more than one page", () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue()], meta: multiPageMeta },
      isLoading: false,
    });
    renderComponent();

    expect(screen.getByText("Page 1 of 4 (87 issues)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("requests the next page when Next is clicked", async () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue()], meta: multiPageMeta },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(mockUseProjectIssues).toHaveBeenCalledWith(PROJECT_ID, {
        status_category: undefined,
        type: undefined,
        page: 2,
      });
    });
  });

  it("disables Next on the last page", async () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue()], meta: multiPageMeta },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    });
  });

  it("hides the client-side assignee filter on multi-page results", () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue({ assigneeName: "Alice" })], meta: multiPageMeta },
      isLoading: false,
    });
    renderComponent();

    expect(screen.queryByText("All assignees")).not.toBeInTheDocument();
  });

  it("keeps the assignee filter for single-page results", () => {
    mockUseProjectIssues.mockReturnValue({
      data: { data: [makeIssue({ assigneeName: "Alice" })], meta: singlePageMeta },
      isLoading: false,
    });
    renderComponent();

    expect(screen.getByText("All assignees")).toBeInTheDocument();
  });
});
