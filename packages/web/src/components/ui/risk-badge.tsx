import type { ReactNode } from "react";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const riskLabel: Record<RiskLevel, string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
  none:     "None",
};

// Exact Figma measurements:
//   container 10×10px, 3 bars, gap 1.25px between bars
//   bar width = (10 - 2×1.25) / 3 = 2.5px, rx 1.25 (capsule)
//   bar x positions: 0, 3.75, 7.5
//   bar heights (bottom-aligned): 5px, 7.5px, 10px
//   active = full opacity, inactive = 0.2 opacity

function BarsIcon({ active }: { active: 1 | 2 | 3 }) {
  const o = (bar: 1 | 2 | 3) => (bar <= active ? 1 : 0.2);
  return (
    <svg width="1em" height="1em" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="shrink-0">
      {/* bar 1: h=5, y=5 */}
      <rect x="0"    y="5"   width="2.5" height="5"   rx="1.25" opacity={o(1)} />
      {/* bar 2: h=7.5, y=2.5 */}
      <rect x="3.75" y="2.5" width="2.5" height="7.5" rx="1.25" opacity={o(2)} />
      {/* bar 3: h=10, y=0 */}
      <rect x="7.5"  y="0"   width="2.5" height="10"  rx="1.25" opacity={o(3)} />
    </svg>
  );
}

// None: 3 bars at h=1.25px, centered vertically (y=4.375), no border-radius
function NoneIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="shrink-0">
      <rect x="0"    y="4.375" width="2.5" height="1.25" opacity={0.5} />
      <rect x="3.75" y="4.375" width="2.5" height="1.25" opacity={0.5} />
      <rect x="7.5"  y="4.375" width="2.5" height="1.25" opacity={0.5} />
    </svg>
  );
}

// Critical: exact Figma SVG — amber #FFB800 filled rounded square + dark exclamation
function CriticalIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="10" height="10" rx="2.5" className="fill-foreground" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 2.14286C5.14208 2.14286 5.27834 2.1993 5.37881 2.29976C5.47927 2.40023 5.53571 2.53649 5.53571 2.67857V4.82143C5.53571 4.96351 5.47927 5.09977 5.37881 5.20024C5.27834 5.3007 5.14208 5.35714 5 5.35714C4.85792 5.35714 4.72166 5.3007 4.62119 5.20024C4.52073 5.09977 4.46429 4.96351 4.46429 4.82143V2.67857C4.46429 2.53649 4.52073 2.40023 4.62119 2.29976C4.72166 2.1993 4.85792 2.14286 5 2.14286ZM5 7.85714C5.18944 7.85714 5.37112 7.78189 5.50508 7.64793C5.63903 7.51398 5.71429 7.3323 5.71429 7.14286C5.71429 6.95342 5.63903 6.77174 5.50508 6.63778C5.37112 6.50383 5.18944 6.42857 5 6.42857C4.81056 6.42857 4.62888 6.50383 4.49492 6.63778C4.36097 6.77174 4.28571 6.95342 4.28571 7.14286C4.28571 7.3323 4.36097 7.51398 4.49492 7.64793C4.62888 7.78189 4.81056 7.85714 5 7.85714Z"
        className="fill-background"
      />
    </svg>
  );
}

const riskIcon: Record<RiskLevel, ReactNode> = {
  critical: <CriticalIcon />,
  high:     <BarsIcon active={3} />,
  medium:   <BarsIcon active={2} />,
  low:      <BarsIcon active={1} />,
  none:     <NoneIcon />,
};

const riskPillClass: Record<RiskLevel, string> = {
  critical: "bg-risk-critical/15 text-risk-critical border-risk-critical/30",
  high:     "bg-risk-high/15 text-risk-high border-risk-high/30",
  medium:   "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  low:      "bg-risk-low/15 text-risk-low border-risk-low/30",
  none:     "bg-muted text-muted-foreground border-border",
};

export interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 type-caption font-medium",
        riskPillClass[level],
        className
      )}
    >
      {riskIcon[level]}
      {riskLabel[level]}
    </span>
  );
}
