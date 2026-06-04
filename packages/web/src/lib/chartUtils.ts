export type TimeRange = "7d" | "30d" | "60d" | "90d" | "1y";

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
];

export function getDaysForRange(range: TimeRange): number {
  return TIME_RANGE_OPTIONS.find((opt) => opt.value === range)?.days ?? 30;
}
