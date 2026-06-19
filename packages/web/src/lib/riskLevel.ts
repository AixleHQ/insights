import { RISK_LEVELS, type RiskLevel } from "@/lib/types";

const RISK_LEVEL_SET = new Set<RiskLevel>(RISK_LEVELS);

export function normalizeRiskLevel(
  value: string | null | undefined
): RiskLevel {
  return RISK_LEVEL_SET.has(value as RiskLevel) ? (value as RiskLevel) : "none";
}
