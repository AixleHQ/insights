import { cn } from "@/lib/utils";

interface CircleProgressProps {
  value: number; // 0–1
  size?: number; // px, default 18
  strokeWidth?: number;
  className?: string;
}

export function CircleProgress({
  value,
  size = 18,
  strokeWidth = 2.5,
  className,
}: CircleProgressProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, Math.max(0, value)));

  const color =
    value >= 0.9
      ? "text-success"
      : value >= 0.85
        ? "text-warning"
        : value >= 0.7
          ? "text-risk-high"
          : "text-muted-foreground";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", color, className)}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-current opacity-15"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="stroke-current transition-[stroke-dashoffset]"
      />
    </svg>
  );
}
