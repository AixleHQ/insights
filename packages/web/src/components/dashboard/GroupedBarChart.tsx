import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

export type GroupedBarSeries = {
  key: string;
  label: string;
  color: string;
};

export interface GroupedBarChartProps {
  data: Record<string, number>[];
  groups: string[];
  series: GroupedBarSeries[];
  yLabel?: string;
  title?: string;
  description?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function GroupedBarChart({
  data,
  groups,
  series,
  yLabel,
  title,
  description,
  isLoading,
  isError,
  onRetry,
  className,
}: GroupedBarChartProps) {
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    series.forEach((s) => {
      config[s.key] = { label: s.label, color: s.color };
    });
    return config;
  }, [series]);

  // Merge numeric data with x-axis group label.
  // _group uses underscore prefix to avoid collision with series keys.
  const chartData = useMemo(
    () => data.map((d, i) => ({ ...d, _group: groups[i] })),
    [data, groups],
  );

  return (
    <Card className={cn("col-span-full", className)}>
      {(title || description) && (
        <CardHeader className="pb-2">
          {title && <CardTitle className="text-base font-medium">{title}</CardTitle>}
          {description && (
            <CardDescription className="text-xs">{description}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent>
        {isError ? (
          <div className="flex h-[280px] items-center justify-center">
            <ErrorState
              compact
              title="Could not load chart"
              description="Something went wrong fetching the data."
              onRetry={onRetry}
            />
          </div>
        ) : isLoading ? (
          <ChartSkeleton height={280} />
        ) : data.length === 0 && series.length > 0 ? (
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                  vertical={false}
                />
                <XAxis
                  dataKey="_group"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={yLabel ? 55 : 40}
                  label={
                    yLabel
                      ? {
                          value: yLabel,
                          angle: -90,
                          position: "insideLeft",
                          style: { fill: "currentColor", fontSize: 11 },
                        }
                      : undefined
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const s = series.find((s) => s.key === name);
                        return (
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: s?.color }}
                            />
                            <span>{s?.label ?? String(name)}: {value}</span>
                          </span>
                        );
                      }}
                    />
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingTop: "12px" }}
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">
                      {series.find((s) => s.key === value)?.label ?? String(value)}
                    </span>
                  )}
                />
                {series.map((s) => (
                  <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
