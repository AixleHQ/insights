import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/error-state";
import { formatDateLabel, sliceCostTrendWindow } from "@/lib/dashboardUtils";
import { formatCost } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface DailyCostData {
  date: string;
  cost: number;
  events: number;
}

interface CostTrendChartProps {
  data: DailyCostData[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  allTime?: boolean;
  monthScoped?: boolean;
  className?: string;
}

type TimeRange = "7d" | "30d";

const chartConfig = {
  cost: {
    label: "Cost",
    color: "var(--chart-1)",
  },
  events: {
    label: "Events",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;


export function CostTrendChart({
  data,
  isLoading,
  isError,
  onRetry,
  allTime = false,
  monthScoped = false,
  className,
}: CostTrendChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const windowDays = timeRange === "7d" ? 7 : 30;
  const filteredData = allTime
    ? data
    : sliceCostTrendWindow(data, windowDays, { monthScoped });
  const formattedData = filteredData.map((item) => ({
    ...item,
    dateLabel: formatDateLabel(item.date, allTime ? "month" : "day"),
  }));

  const totalCost = filteredData.reduce((sum, item) => sum + item.cost, 0);
  const avgCost = filteredData.length > 0 ? totalCost / filteredData.length : 0;
  const avgLabel = allTime ? `${formatCost(avgCost)}/mo` : `${formatCost(avgCost)}/day`;

  return (
    <Card className={cn("col-span-full lg:col-span-2", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Cost Trend</CardTitle>
          <CardDescription className="text-xs">
            Total: {formatCost(totalCost)} | Avg: {avgLabel}
          </CardDescription>
        </div>
        {!allTime && (
          <div className="flex gap-1">
            <Button
              variant={timeRange === "7d" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTimeRange("7d")}
            >
              7 days
            </Button>
            <Button
              variant={timeRange === "30d" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTimeRange("30d")}
            >
              30 days
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex h-[200px] items-center justify-center">
            <ErrorState
              compact
              title="Could not load chart"
              description="Something went wrong fetching the data."
              onRetry={onRetry}
            />
          </div>
        ) : isLoading ? (
          <ChartSkeleton height={200} />
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs text-muted-foreground"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                  className="text-xs text-muted-foreground"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={50}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        name === "cost" ? formatCost(value as number) : value
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
