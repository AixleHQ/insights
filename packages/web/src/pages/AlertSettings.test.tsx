import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { AlertSettings } from "./Settings";

vi.mock("@/contexts/OrgContext", () => ({
  useOrg: () => ({
    currentOrg: { id: "test-org-id", name: "Test Org", slug: "test-org" },
    isLoading: false,
  }),
}));

const mockMutateAsync = vi.fn();
const mockRetentionMutate = vi.fn();

let mockSettingsData: { data: Array<{ key: string; value: string }> } | undefined = undefined;
let mockRetentionData: {
  costThresholdCents: number | null;
  tokenThreshold: number | null;
  alertEnabled: boolean;
} | undefined = undefined;

vi.mock("@/hooks/useApi", () => ({
  useOrganizationSettings: () => ({
    data: mockSettingsData,
    isLoading: false,
  }),
  useUpdateOrganizationSetting: () => ({
    mutate: vi.fn(),
    mutateAsync: mockMutateAsync,
  }),
  useRetentionPolicy: () => ({
    data: mockRetentionData,
    isLoading: false,
  }),
  useUpdateRetentionPolicy: () => ({
    mutate: mockRetentionMutate,
    isPending: false,
    isError: false,
  }),
}));

function renderAlertSettings() {
  return render(<AlertSettings />);
}

describe("AlertSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    mockSettingsData = undefined;
    mockRetentionData = undefined;
  });

  // ── Cost & Token Thresholds ────────────────────────────────────────────────

  describe("Cost & Token Thresholds", () => {
    it("renders cost and token threshold inputs", () => {
      renderAlertSettings();
      expect(screen.getByLabelText("Cost Threshold (USD)")).toBeInTheDocument();
      expect(screen.getByLabelText("Token Threshold")).toBeInTheDocument();
    });

    it("shows empty cost input when no retention policy set", () => {
      renderAlertSettings();
      expect(screen.getByLabelText("Cost Threshold (USD)")).toHaveValue(null);
    });

    it("populates cost input from retention policy (cents to dollars)", () => {
      mockRetentionData = { costThresholdCents: 50000, tokenThreshold: null, alertEnabled: true };
      renderAlertSettings();
      expect(screen.getByLabelText("Cost Threshold (USD)")).toHaveValue(500);
    });

    it("populates token input from retention policy", () => {
      mockRetentionData = { costThresholdCents: null, tokenThreshold: 1000000, alertEnabled: true };
      renderAlertSettings();
      expect(screen.getByLabelText("Token Threshold")).toHaveValue(1000000);
    });

    it("renders save thresholds button", () => {
      renderAlertSettings();
      expect(screen.getByRole("button", { name: /save thresholds/i })).toBeInTheDocument();
    });

    it("save button is disabled when form is not dirty", () => {
      renderAlertSettings();
      expect(screen.getByRole("button", { name: /save thresholds/i })).toBeDisabled();
    });

    it("save button is enabled after changing cost input", async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      await user.type(screen.getByLabelText("Cost Threshold (USD)"), "10");

      expect(screen.getByRole("button", { name: /save thresholds/i })).not.toBeDisabled();
    });

    it("calls retention policy mutation with correct payload on save", async () => {
      const user = userEvent.setup();
      renderAlertSettings();

      await user.type(screen.getByLabelText("Cost Threshold (USD)"), "20");
      await user.click(screen.getByRole("button", { name: /save thresholds/i }));

      expect(mockRetentionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "test-org-id",
          data: expect.objectContaining({ cost_threshold_cents: 2000 }),
        })
      );
    });
  });

  // ── Risk Alerts ────────────────────────────────────────────────────────────

  describe("Risk Alerts toggles", () => {
    it("renders all three risk alert toggles", () => {
      renderAlertSettings();

      expect(screen.getByRole("switch", { name: /critical risk events/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /high risk events/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /usage spikes/i })).toBeInTheDocument();
    });

    it("critical risk toggle is checked by default (no setting)", () => {
      renderAlertSettings();
      // Default is true when no setting exists
      expect(screen.getByRole("switch", { name: /critical risk events/i })).toBeChecked();
    });

    it("critical risk toggle is unchecked when setting is false", () => {
      mockSettingsData = { data: [{ key: "alert_risk_critical", value: "false" }] };
      renderAlertSettings();
      expect(screen.getByRole("switch", { name: /critical risk events/i })).not.toBeChecked();
    });

    it("saves critical risk setting when toggled", async () => {
      mockSettingsData = { data: [{ key: "alert_risk_critical", value: "true" }] };
      const user = userEvent.setup();
      renderAlertSettings();

      await user.click(screen.getByRole("switch", { name: /critical risk events/i }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ key: "alert_risk_critical" })
        );
      });
    });
  });
});
