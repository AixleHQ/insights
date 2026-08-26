import type { DashboardPeriod } from "@/lib/types";

export function formatDateLabel(dateStr: string, granularity: "month" | "day"): string {
  const date = new Date(dateStr + "T00:00:00");
  if (granularity === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Mon-start week bucket → "Jul 6 - 12" or "Jun 29 - Jul 5" when the week crosses months. */
export function formatWeekRange(dateStr: string): string {
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Last N points, clamped to elapsed calendar days when data is a full month series. */
export function sliceCostTrendWindow<T extends { date: string }>(
  data: T[],
  windowDays: number,
  opts: { monthScoped: boolean; today?: Date } = { monthScoped: false }
): T[] {
  if (!opts.monthScoped) return data.slice(-windowDays);

  const todayStr = formatLocalDate(opts.today ?? new Date());
  return data.filter((d) => d.date <= todayStr).slice(-windowDays);
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function isCurrentMonth(value: string): boolean {
  return value === currentMonth();
}

export function projectScopeLabel(
  projectId: string | undefined,
  projects: { id: string; name: string }[] | undefined,
  noun: string
): string {
  if (!projectId) return `${noun} across your organization`;
  if (projectId === "none") return `${noun} not assigned to a project`;
  const name = projects?.find((p) => p.id === projectId)?.name;
  return name ? `${noun} for ${name}` : `${noun} for the selected project`;
}

export function getLast12Months(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return months;
}

/**
 * Convert a dashboard period into the inclusive date range the /events endpoint
 * accepts (start_date / end_date, YYYY-MM-DD). all_time → no bounds. Mirrors the
 * month window the stats endpoints compute server-side so Recent Activity matches
 * the stats cards.
 */
export function periodToDateRange(
  period: DashboardPeriod
): { start_date?: string; end_date?: string } {
  if (period.type !== "month") return {};
  const [year, month] = period.value.split("-").map(Number);
  // Day 0 of the next month == last calendar day of this month.
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start_date: `${period.value}-01`,
    end_date: `${period.value}-${String(lastDay).padStart(2, "0")}`,
  };
}
