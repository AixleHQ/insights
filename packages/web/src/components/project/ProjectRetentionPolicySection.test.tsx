import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectRetentionPolicySection } from "./ProjectRetentionPolicySection";

// Radix UI Select requires these methods in jsdom
beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mockUseProjectRetentionPolicy = vi.fn();
const mockUseUpdateProjectRetentionPolicy = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectRetentionPolicy: (...args: unknown[]) => mockUseProjectRetentionPolicy(...args),
  useUpdateProjectRetentionPolicy: () => mockUseUpdateProjectRetentionPolicy(),
}));

const PROJECT_ID = "test-project-id";

const mockPolicy = {
  id: "policy-1",
  projectId: PROJECT_ID,
  rawEventTtl: "24_hours" as const,
  toolEventsRetention: "90_days" as const,
  hourlyAggregateRetention: "365_days" as const,
  dailyAggregateRetention: "forever" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectRetentionPolicySection projectId={PROJECT_ID} />
    </QueryClientProvider>
  );
}

describe("ProjectRetentionPolicySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectRetentionPolicy.mockReturnValue({ data: mockPolicy, isLoading: false });
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
  });

  it("renders four select dropdowns", () => {
    renderComponent();

    expect(screen.getByText("Raw Event TTL")).toBeInTheDocument();
    expect(screen.getByText("Tool Events")).toBeInTheDocument();
    expect(screen.getByText("Hourly Aggregates")).toBeInTheDocument();
    expect(screen.getByText("Daily Aggregates")).toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({ data: undefined, isLoading: true });
    renderComponent();

    expect(screen.queryByText("Raw Event TTL")).not.toBeInTheDocument();
  });

  it("calls mutation immediately when TTL is increased (no confirmation needed)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync, isPending: false });

    // Start with 24_hours, increase to 48_hours
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { ...mockPolicy, rawEventTtl: "24_hours" },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderComponent();

    // Open the Raw Event TTL select and pick a longer value
    const rawEventSelect = screen.getAllByRole("combobox")[0];
    await user.click(rawEventSelect);
    const option = await screen.findByRole("option", { name: "48 hours" });
    await user.click(option);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        data: { raw_event_ttl: "48_hours" },
      });
    });

    // No confirmation dialog should appear
    expect(screen.queryByText("Reduce retention period?")).not.toBeInTheDocument();
  });

  it("shows confirmation dialog when TTL is reduced", async () => {
    // Start with 48_hours, reduce to 6_hours
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { ...mockPolicy, rawEventTtl: "48_hours" },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderComponent();

    const rawEventSelect = screen.getAllByRole("combobox")[0];
    await user.click(rawEventSelect);
    const option = await screen.findByRole("option", { name: "6 hours" });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Reduce retention period?")).toBeInTheDocument();
    });
  });

  it("calls mutation when confirmation dialog is confirmed", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync, isPending: false });

    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { ...mockPolicy, rawEventTtl: "48_hours" },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderComponent();

    const rawEventSelect = screen.getAllByRole("combobox")[0];
    await user.click(rawEventSelect);
    const option = await screen.findByRole("option", { name: "6 hours" });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Reduce retention period?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /reduce retention/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        data: { raw_event_ttl: "6_hours" },
      });
    });
  });

  it("does not call mutation when confirmation dialog is cancelled", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync, isPending: false });

    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { ...mockPolicy, rawEventTtl: "48_hours" },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderComponent();

    const rawEventSelect = screen.getAllByRole("combobox")[0];
    await user.click(rawEventSelect);
    const option = await screen.findByRole("option", { name: "6 hours" });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Reduce retention period?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("Reduce retention period?")).not.toBeInTheDocument();
    });
  });

  it("shows error alert when mutation fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("Server error"));
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({ mutateAsync, isPending: false });

    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { ...mockPolicy, rawEventTtl: "24_hours" },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderComponent();

    const rawEventSelect = screen.getAllByRole("combobox")[0];
    await user.click(rawEventSelect);
    const option = await screen.findByRole("option", { name: "48 hours" });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByText("Failed to save. Please try again.")).toBeInTheDocument();
    });
  });
});
