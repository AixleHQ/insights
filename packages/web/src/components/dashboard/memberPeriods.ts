export const MEMBER_PERIODS = ["7d", "30d", "90d"] as const;
export type MemberPeriod = (typeof MEMBER_PERIODS)[number];

export const MEMBER_PERIOD_LABELS: Record<MemberPeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};
