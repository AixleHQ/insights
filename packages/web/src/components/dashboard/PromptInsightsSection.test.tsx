import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import { PromptInsightsSection } from "./PromptInsightsSection";
import type { PromptInsights } from "@/hooks/useApi";

vi.mock("@/hooks/useApi", () => ({
  usePromptInsights: vi.fn(),
}));

import { usePromptInsights } from "@/hooks/useApi";

const mockUsePromptInsights = vi.mocked(usePromptInsights);

const LOADED_DATA: PromptInsights = {
  score: 7.4,
  dimensions: { structure: 8.2, context: 7.1, specificity: 6.9 },
  callouts: [
    { type: "strength", label: "Top Strength", text: "Structure: Well-formed, detailed prompts" },
    { type: "tool", label: "Best Tool", text: "claude_code · 142 events" },
    { type: "opportunity", label: "Biggest Opportunity", text: "Specificity: Try more targeted requests" },
  ],
};

const EMPTY_DATA: PromptInsights = {
  score: 0,
  dimensions: { structure: 0, context: 0, specificity: 0 },
  callouts: [],
};

function renderSection() {
  return render(
    <PromptInsightsSection orgId="org-1" userId="user-1" period="30d" />
  );
}

describe("PromptInsightsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeleton while fetching", () => {
    mockUsePromptInsights.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(screen.getByText("Prompt Insights")).toBeInTheDocument();
    // Skeletons render; no score or bars yet
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
  });

  it("renders score and dimension bars when loaded", () => {
    mockUsePromptInsights.mockReturnValue({
      data: LOADED_DATA,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(screen.getByText("7.4")).toBeInTheDocument();
    expect(screen.getByText("/ 10")).toBeInTheDocument();
    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Specificity")).toBeInTheDocument();
  });

  it("renders callout items when loaded", () => {
    mockUsePromptInsights.mockReturnValue({
      data: LOADED_DATA,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(screen.getByText("Top Strength")).toBeInTheDocument();
    expect(screen.getByText("Best Tool")).toBeInTheDocument();
    expect(screen.getByText("Biggest Opportunity")).toBeInTheDocument();
    expect(screen.getByText("Structure: Well-formed, detailed prompts")).toBeInTheDocument();
    expect(screen.getByText("claude_code · 142 events")).toBeInTheDocument();
  });

  it("renders empty state when callouts array is empty", () => {
    mockUsePromptInsights.mockReturnValue({
      data: EMPTY_DATA,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(
      screen.getByText(/Not enough data yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
  });

  it("renders error message on fetch failure", () => {
    mockUsePromptInsights.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(screen.getByText("Could not load insights")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("progress bars have accessible aria-labels", () => {
    mockUsePromptInsights.mockReturnValue({
      data: LOADED_DATA,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePromptInsights>);

    renderSection();

    expect(
      screen.getByRole("progressbar", { name: /Structure score 8.2 out of 10/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /Context score 7.1 out of 10/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /Specificity score 6.9 out of 10/i })
    ).toBeInTheDocument();
  });
});
