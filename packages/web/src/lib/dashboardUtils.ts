export function fillDateGaps<T extends { date: string }>(
  data: T[],
  makeDefault: (date: string) => T
): T[] {
  if (data.length < 2) return data;
  const byDate = new Map(data.map((d) => [d.date, d]));
  const first = new Date(data[0].date + "T00:00:00");
  const last = new Date(data[data.length - 1].date + "T00:00:00");
  const result: T[] = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const key = formatLocalDate(d);
    result.push(byDate.get(key) ?? makeDefault(key));
  }
  return result;
}

export function formatDateLabel(dateStr: string, granularity: "month" | "day"): string {
  const date = new Date(dateStr + "T00:00:00");
  if (granularity === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
