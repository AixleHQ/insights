import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ProjectAlertsSection } from "./ProjectAlertsSection";

// Radix UI Select requires these methods in jsdom
beforeAll(() => {
  window.Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.Element.prototype.setPointerCapture = vi.fn();
  window.Element.prototype.releasePointerCapture = vi.fn();
  window.Element.prototype.scrollIntoView = vi.fn();
});

const mockUseProjectSettings = vi.fn();
const mockUseOrganizationSettings = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useProjectSettings: (...args: unknown[]) => mockUseProjectSettings(...args),
  useOrganizationSettings: (...args: unknown[]) => mockUseOrganizationSettings(...args),
  useUpdateProjectSetting: () => ({ mutate: mockUpdateMutate }),
  useDeleteProjectSetting: () => ({ mutate: mockDeleteMutate }),
}));

const defaultProps = { projectId: "proj-1", orgId: "org-1" };

const emptyProject = { data: { data: [] }, isLoading: false };
const emptyOrg = { data: { data: [] }, isLoading: false };

describe("ProjectAlertsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectSettings.mockReturnValue(emptyProject);
    mockUseOrganizationSettings.mockReturnValue(emptyOrg);
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows skeletons while project settings are loading", () => {
    mockUseProjectSettings.mockReturnValue({ data: undefined, isLoading: true });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.queryByText("Alert Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost Thresholds")).not.toBeInTheDocument();
  });

  it("shows skeletons while org settings are loading", () => {
    mockUseOrganizationSettings.mockReturnValue({ data: undefined, isLoading: true });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.queryByText("Alert Settings")).not.toBeInTheDocument();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders section headings and cards", () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Alert Settings")).toBeInTheDocument();
    expect(screen.getByText("Cost Thresholds")).toBeInTheDocument();
    expect(screen.getByText("Notification Channels")).toBeInTheDocument();
    expect(screen.getByLabelText("Daily Cost Limit (USD)")).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly Cost Limit (USD)")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Alerts")).toBeInTheDocument();
  });

  // ── Cost threshold — initial state ─────────────────────────────────────────

  it("populates cost inputs from saved project settings", () => {
    mockUseProjectSettings.mockReturnValue({
      data: {
        data: [
          { key: "alert_cost_daily", value: "200" },
          { key: "alert_cost_monthly", value: "3000" },
        ],
      },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByLabelText("Daily Cost Limit (USD)")).toHaveValue(200);
    expect(screen.getByLabelText("Monthly Cost Limit (USD)")).toHaveValue(3000);
  });

  it("shows org default as placeholder when no project cost is set", () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: {
        data: [
          { key: "alert_cost_daily", value: "500" },
          { key: "alert_cost_monthly", value: "5000" },
        ],
      },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByPlaceholderText(/Org default:.*day/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Org default:.*month/)).toBeInTheDocument();
  });

  it("shows inherit helper text when no project cost is set and org default exists", () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: { data: [{ key: "alert_cost_daily", value: "500" }] },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText(/Inheriting org default:.*day/)).toBeInTheDocument();
  });

  it('shows "No organisation default set" when neither project nor org value exists', () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getAllByText("No organisation default set")).toHaveLength(2);
  });

  it('shows "Overriding organisation default" when project value is set', () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_cost_daily", value: "100" }] },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Overriding organisation default")).toBeInTheDocument();
  });

  // ── Cost threshold — mutations ─────────────────────────────────────────────

  it("calls update mutation on blur when a new valid daily value is entered", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    const input = screen.getByLabelText("Daily Cost Limit (USD)");
    await user.type(input, "250");
    await user.tab();

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        { projectId: "proj-1", key: "alert_cost_daily", value: "250" },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });
  });

  it("calls update mutation on blur when a new valid monthly value is entered", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    const input = screen.getByLabelText("Monthly Cost Limit (USD)");
    await user.type(input, "4000");
    await user.tab();

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        { projectId: "proj-1", key: "alert_cost_monthly", value: "4000" },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });
  });

  it("calls delete mutation when daily input is cleared and project value was set", async () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_cost_daily", value: "200" }] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    const input = screen.getByLabelText("Daily Cost Limit (USD)");
    await user.clear(input);
    await user.tab();

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith(
        { projectId: "proj-1", key: "alert_cost_daily" },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });
  });

  it("does not call any mutation when input is cleared but no project value was set", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    const input = screen.getByLabelText("Daily Cost Limit (USD)");
    await user.click(input);
    await user.tab();

    expect(mockUpdateMutate).not.toHaveBeenCalled();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("does not call mutation when blurring with the same value as already saved", async () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_cost_daily", value: "200" }] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    const input = screen.getByLabelText("Daily Cost Limit (USD)");
    await user.click(input);
    await user.tab();

    expect(mockUpdateMutate).not.toHaveBeenCalled();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  // ── Email alerts ───────────────────────────────────────────────────────────

  it('shows "inherit" selected by default when no project email setting', () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText(/Inherit from organisation/)).toBeInTheDocument();
    expect(screen.getByText(/Using organisation default:/)).toBeInTheDocument();
  });

  it('shows org email default label as "Enabled" when org has no explicit setting', () => {
    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText(/Using organisation default: Enabled/)).toBeInTheDocument();
  });

  it('shows org email default label as "Disabled" when org sets alert_email to false', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: { data: [{ key: "alert_email", value: "false" }] },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText(/Using organisation default: Disabled/)).toBeInTheDocument();
  });

  it('calls update mutation with "true" when Enabled is selected', async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Enabled" }));

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      projectId: "proj-1",
      key: "alert_email",
      value: "true",
    });
  });

  it('calls update mutation with "false" when Disabled is selected', async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Disabled" }));

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      projectId: "proj-1",
      key: "alert_email",
      value: "false",
    });
  });

  it("calls delete mutation when Inherit is selected and project value was set", async () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_email", value: "false" }] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Inherit from organisation/ }));

    expect(mockDeleteMutate).toHaveBeenCalledWith({
      projectId: "proj-1",
      key: "alert_email",
    });
  });

  it("does not call delete mutation when Inherit is selected and no project value was set", async () => {
    const user = userEvent.setup();
    render(<ProjectAlertsSection {...defaultProps} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Inherit from organisation/ }));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('shows override helper text when project email setting is "true"', () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_email", value: "true" }] },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Overriding: email alerts enabled for this project")).toBeInTheDocument();
  });

  it('shows override helper text when project email setting is "false"', () => {
    mockUseProjectSettings.mockReturnValue({
      data: { data: [{ key: "alert_email", value: "false" }] },
      isLoading: false,
    });

    render(<ProjectAlertsSection {...defaultProps} />);

    expect(screen.getByText("Overriding: email alerts disabled for this project")).toBeInTheDocument();
  });
});
