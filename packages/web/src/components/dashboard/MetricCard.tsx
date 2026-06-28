import { type ReactNode, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCost, formatPercent, formatTokens, formatCount } from "@/lib/formatters";

type MetricCardBaseProps = {
  value: string | number;
  previousValue?: number;
  format?: "number" | "currency" | "percentage" | "compact";
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  delta?: string;
  subtitle?: string;
  trendValue?: string;
  description?: string;
  className?: string;
};

type MetricCardProps = MetricCardBaseProps &
  ({ label: string; title?: string } | { label?: string; title: string });

function formatValue(value: string | number, format?: string): string {
  if (typeof value === "string") return value;

  switch (format) {
    case "currency":
      return formatCost(value);
    case "percentage":
      return formatPercent(value);
    case "compact":
      return formatTokens(value);
    case "number":
    default:
      return formatCount(value);
  }
}

export function MetricCard({
  label,
  delta,
  subtitle,
  title,
  trendValue,
  description,
  value,
  format = "number",
  icon,
  trend,
  className,
}: MetricCardProps) {
  const resolvedLabel = label ?? title!;
  const resolvedDelta = delta ?? trendValue;
  const resolvedSubtitle = subtitle ?? description;

  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  // Detect value changes and trigger animation
  useEffect(() => {
    if (prevValueRef.current !== value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 600);
      prevValueRef.current = value;
      return () => clearTimeout(timer);
    }
  }, [value]);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:shadow-md",
        className
      )}
    >
      <CardContent className="px-6 py-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="type-label text-muted-foreground">{resolvedLabel}</p>
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <p
                className={cn(
                  "min-w-0 max-w-full break-all font-mono-display type-h1",
                  isAnimating && "animate-metric-update"
                )}
              >
                {formatValue(value, format)}
              </p>
              {resolvedDelta && (
                <span className={cn("flex items-center gap-0.5 text-caption font-medium", trendColor)}>
                  <TrendIcon className="size-3" />
                  {resolvedDelta}
                </span>
              )}
            </div>
            {resolvedSubtitle && (
              <p className="type-caption text-muted-foreground">{resolvedSubtitle}</p>
            )}
          </div>
          {icon && (
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
        </div>

        {/* Decorative gradient line at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </CardContent>
    </Card>
  );
}

interface MetricGridProps {
  children: ReactNode;
  className?: string;
}

export function MetricGrid({ children, className }: MetricGridProps) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", className)}>
      {children}
    </div>
  );
}
