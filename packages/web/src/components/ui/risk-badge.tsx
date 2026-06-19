import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const riskConfig: Record<
  Exclude<RiskLevel, "none">,
  { bg: string; text: string; border: string; dot: string }
> = {
  critical: {
    bg: "bg-risk-critical/10",
    text: "text-risk-critical",
    border: "border-risk-critical/30",
    dot: "bg-risk-critical",
  },
  high: {
    bg: "bg-risk-high/10",
    text: "text-risk-high",
    border: "border-risk-high/30",
    dot: "bg-risk-high",
  },
  medium: {
    bg: "bg-risk-medium/10",
    text: "text-risk-medium",
    border: "border-risk-medium/30",
    dot: "bg-risk-medium",
  },
  low: {
    bg: "bg-risk-low/10",
    text: "text-risk-low",
    border: "border-risk-low/30",
    dot: "bg-risk-low",
  },
};

export interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  if (level === "none") return null;

  const config = riskConfig[level];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono-display text-[10px] uppercase tracking-wider",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {level}
    </Badge>
  );
}
