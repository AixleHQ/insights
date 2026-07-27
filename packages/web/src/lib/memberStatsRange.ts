import type { MemberStatsRange } from "@/hooks/useApi";

export const RANGE_OPTIONS: { value: MemberStatsRange; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All time" },
];

export const RANGE_SUBTITLE: Record<MemberStatsRange, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
  all: "All time",
};
