export function formatDateLabel(dateStr: string, allTime: boolean): string {
  const date = new Date(dateStr + "T00:00:00");
  if (allTime) {
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
