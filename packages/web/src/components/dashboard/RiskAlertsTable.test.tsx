import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import { RiskAlertsTable } from "./RiskAlertsTable";

const mockNavigate = vi.fn();
const mockUseOrgRiskAlerts = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useApi", () => ({
  useOrgRiskAlerts: (...a: unknown[]) => mockUseOrgRiskAlerts(...a),
}));

vi.mock("@/components/icons", () => ({
  ProviderLogo: ({ provider }: { provider: string }) => (
    <span data-testid={`logo-${provider}`} />
  ),
}));

describe("RiskAlertsTable — Figma Team dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOrgRiskAlerts.mockReturnValue({
      data: [
        {
          toolName: "cursor",
          eventCount: 451,
          tokensIn: 314_900,
          tokensOut: 503_000,
          costUsd: 6.73,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("shows tool logo and combined Tokens in / out column", () => {
    render(<RiskAlertsTable orgId="org-1" />);

    expect(screen.getByTestId("logo-cursor")).toBeInTheDocument();
    expect(screen.getByText("Tokens in / out")).toBeInTheDocument();
    expect(screen.queryByText("Tokens In")).not.toBeInTheDocument();
    expect(screen.queryByText("Tokens Out")).not.toBeInTheDocument();
    expect(screen.getByText("314.9K / 503.0K")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("451")).toBeInTheDocument();
    expect(screen.getByText("$6.73")).toBeInTheDocument();
  });
});

describe("RiskAlertsTable — project/period scope subtitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOrgRiskAlerts.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("renders no subtitle when no projects list is supplied", () => {
    render(<RiskAlertsTable orgId="org1" />);
    expect(screen.getByText("Risk Alerts")).toBeInTheDocument();
    expect(screen.queryByText(/Risk alerts/)).not.toBeInTheDocument();
  });

  it("shows the org-wide scope label when no project is selected", () => {
    render(<RiskAlertsTable orgId="org1" projects={[{ id: "p1", name: "Aixle Insights" }]} />);
    expect(screen.getByText("Risk alerts across your organization")).toBeInTheDocument();
  });

  it("shows the selected project's name combined with the period", () => {
    render(
      <RiskAlertsTable
        orgId="org1"
        projectId="p1"
        projects={[{ id: "p1", name: "Aixle Insights" }]}
        period={{ type: "month", value: "2026-07" }}
      />
    );
    expect(screen.getByText(/Risk alerts for Aixle Insights · July 2026/)).toBeInTheDocument();
  });
});
