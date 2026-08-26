import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import { WeeklyToolUsageChart } from "./WeeklyToolUsageChart";

const mockUseDailyByTool = vi.fn();
const mockUseDailyByModel = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useDailyByTool: (...a: unknown[]) => mockUseDailyByTool(...a),
  useDailyByModel: (...a: unknown[]) => mockUseDailyByModel(...a),
}));

describe("WeeklyToolUsageChart — Figma Team dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDailyByTool.mockReturnValue({
      data: {
        tools: ["cursor", "claude_code"],
        data: [
          { date: "2026-03-01", cursor: 10, claude_code: 5 },
          { date: "2026-03-08", cursor: 20, claude_code: 8 },
        ],
        period: "week",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseDailyByModel.mockReturnValue({
      data: { models: [], data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("requests weekly tool buckets and shows Figma title + event subtitle", () => {
    render(
      <WeeklyToolUsageChart
        orgId="org-1"
        externalPeriod={{ type: "month", value: "2026-03" }}
      />
    );

    expect(mockUseDailyByTool).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ period: "week", month: "2026-03" })
    );
    expect(screen.getByText("Usage by tool")).toBeInTheDocument();
    expect(screen.getByText(/43 events · March 2026/i)).toBeInTheDocument();
    // Week-range x-axis labels are covered by formatWeekRange unit tests;
    // Recharts ticks often do not paint in jsdom (0×0 container).
    expect(screen.queryByText(/Week \d/)).not.toBeInTheDocument();
  });
});
