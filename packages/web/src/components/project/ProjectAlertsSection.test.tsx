import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectAlertsSection } from "./ProjectAlertsSection";

const mockUseProjectRetentionPolicy = vi.fn();
const mockUseRetentionPolicy = vi.fn();
const mockMutate = vi.fn();
const mockUseUpdateProjectRetentionPolicy = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectRetentionPolicy: (...args: unknown[]) => mockUseProjectRetentionPolicy(...args),
  useRetentionPolicy: (...args: unknown[]) => mockUseRetentionPolicy(...args),
  useUpdateProjectRetentionPolicy: () => mockUseUpdateProjectRetentionPolicy(),
}));

const defaultProps = { projectId: "proj-1", orgId: "org-1" };

const emptyProjectPolicy = {
  data: { costThresholdCents: null, tokenThreshold: null, alertEnabled: true },
  isLoading: false,
};
const emptyOrgPolicy = {
  data: { costThresholdCents: null, tokenThreshold: null, alertEnabled: true },
  isLoading: false,
};

describe("ProjectAlertsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectRetentionPolicy.mockReturnValue(emptyProjectPolicy);
    mockUseRetentionPolicy.mockReturnValue(emptyOrgPolicy);
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    });
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows skeletons while project policy is loading", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({ data: undefined, isLoading: true });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.queryByText("Alert Settings")).not.toBeInTheDocument();
  });

  it("shows skeletons while org policy is loading", () => {
    mockUseRetentionPolicy.mockReturnValue({ data: undefined, isLoading: true });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.queryByText("Alert Settings")).not.toBeInTheDocument();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders section heading and card title", () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Alert Settings")).toBeInTheDocument();
    expect(screen.getByText("Cost & Token Thresholds")).toBeInTheDocument();
  });

  it("renders cost and token inputs", () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByLabelText("Cost Threshold (USD)")).toBeInTheDocument();
    expect(screen.getByLabelText("Token Threshold")).toBeInTheDocument();
  });

  it("renders alert enabled switch", () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByLabelText("Enable alerts")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  // ── Initial values from project policy ────────────────────────────────────

  it("populates cost input from project policy (cents to dollars)", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: 1500, tokenThreshold: null, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByLabelText("Cost Threshold (USD)")).toHaveValue(15);
  });

  it("populates token input from project policy", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: null, tokenThreshold: 50000, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByLabelText("Token Threshold")).toHaveValue(50000);
  });

  it("reflects alertEnabled=false from project policy in switch", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: null, tokenThreshold: null, alertEnabled: false },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("reflects alertEnabled=true from project policy in switch", () => {
    mockUseProjectRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: null, tokenThreshold: null, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByRole("switch")).toBeChecked();
  });

  // ── Org ceiling hints ──────────────────────────────────────────────────────

  it("shows org cost ceiling when org policy has a value", () => {
    mockUseRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: 2000, tokenThreshold: null, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText(/Org ceiling:/)).toBeInTheDocument();
  });

  it("shows org token ceiling when org policy has a value", () => {
    mockUseRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: null, tokenThreshold: 100000, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getAllByText(/Org ceiling:/).length).toBeGreaterThan(0);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("shows error and highlights input when cost exceeds org ceiling", async () => {
    const user = userEvent.setup();
    mockUseRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: 1000, tokenThreshold: null, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Cost Threshold (USD)"), "20");

    expect(screen.getByText(/Must not exceed org ceiling/)).toBeInTheDocument();
  });

  it("shows error when token exceeds org ceiling", async () => {
    const user = userEvent.setup();
    mockUseRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: null, tokenThreshold: 50000, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Token Threshold"), "99999");

    expect(screen.getByText(/Must not exceed org ceiling/)).toBeInTheDocument();
  });

  // ── Save button state ──────────────────────────────────────────────────────

  it("save button is disabled when form is not dirty", () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByRole("button", { name: /save thresholds/i })).toBeDisabled();
  });

  it("save button is enabled after changing cost input", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Cost Threshold (USD)"), "5");

    expect(screen.getByRole("button", { name: /save thresholds/i })).not.toBeDisabled();
  });

  it("save button is disabled when cost exceeds org ceiling even if dirty", async () => {
    const user = userEvent.setup();
    mockUseRetentionPolicy.mockReturnValue({
      data: { costThresholdCents: 500, tokenThreshold: null, alertEnabled: true },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Cost Threshold (USD)"), "20");

    expect(screen.getByRole("button", { name: /save thresholds/i })).toBeDisabled();
  });

  it("save button is enabled after toggling alert enabled switch", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("button", { name: /save thresholds/i })).not.toBeDisabled();
  });

  // ── Mutation ───────────────────────────────────────────────────────────────

  it("calls mutation with correct payload including alert_enabled on save", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Cost Threshold (USD)"), "10");
    await user.click(screen.getByRole("button", { name: /save thresholds/i }));

    expect(mockMutate).toHaveBeenCalledWith({
      projectId: "proj-1",
      data: {
        cost_threshold_cents: 1000,
        token_threshold: null,
        alert_enabled: true,
      },
    });
  });

  it("shows error message when mutation fails", () => {
    mockUseUpdateProjectRetentionPolicy.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Failed to save. Please try again.")).toBeInTheDocument();
  });
});
